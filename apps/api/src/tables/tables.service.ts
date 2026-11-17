import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuFlowGateway, WsEvent } from '../gateway/menuflow.gateway';
import { TableStatus, WaiterCallType, WaiterCallStatus } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 24);

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenuFlowGateway,
  ) {}

  // ─── Halls ───────────────────────────────────────────────────────────────

  async getHalls(restaurantId: string) {
    return this.prisma.hall.findMany({
      where: { restaurantId },
      include: { _count: { select: { tables: true } } },
    });
  }

  async createHall(restaurantId: string, name: string) {
    return this.prisma.hall.create({ data: { restaurantId, name } });
  }

  // ─── Tables ──────────────────────────────────────────────────────────────

  async getTables(restaurantId: string, params: { hallId?: string; status?: TableStatus } = {}) {
    return this.prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
        ...(params.hallId ? { hallId: params.hallId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        hall: { select: { name: true } },
        waiter: { select: { id: true, name: true } },
        qrCodes: { where: { isActive: true }, take: 1 },
        orders: {
          where: { status: { notIn: ['CLOSED', 'CANCELLED'] } },
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, total: true, createdAt: true },
        },
      },
      orderBy: { number: 'asc' },
    });
  }

  async createTable(restaurantId: string, data: {
    number: number;
    hallId?: string;
    waiterId?: string;
  }) {
    const exists = await this.prisma.table.findUnique({
      where: { restaurantId_number: { restaurantId, number: data.number } },
    });
    if (exists) throw new ConflictException(`Стол №${data.number} уже существует`);

    await this.validateAssignments(restaurantId, data.hallId, data.waiterId);
    return this.prisma.table.create({ data: { restaurantId, ...data } });
  }

  async updateTable(id: string, restaurantId: string, data: Partial<{
    number: number;
    hallId: string;
    waiterId: string;
    isActive: boolean;
  }>) {
    await this.ensureTableBelongsTo(id, restaurantId);
    await this.validateAssignments(restaurantId, data.hallId, data.waiterId);
    return this.prisma.table.update({ where: { id }, data });
  }

  async updateTableStatus(id: string, restaurantId: string, status: TableStatus) {
    await this.ensureTableBelongsTo(id, restaurantId);
    const table = await this.prisma.table.update({ where: { id }, data: { status } });
    this.gateway.emitToAllRestaurantStaff(restaurantId, WsEvent.TABLE_STATUS_CHANGED, table);
    return table;
  }

  // ─── QR Codes ────────────────────────────────────────────────────────────

  async generateQr(tableId: string, restaurantId: string) {
    const table = await this.ensureTableBelongsTo(tableId, restaurantId);

    // Деактивируем старые QR
    await this.prisma.qrCode.updateMany({
      where: { tableId, isActive: true },
      data: { isActive: false },
    });

    const token = nanoid();
    const qr = await this.prisma.qrCode.create({
      data: { tableId, token },
    });

    return { ...qr, tableNumber: table.number };
  }

  async getQrByToken(token: string) {
    const qr = await this.prisma.qrCode.findFirst({
      where: {
        token,
        isActive: true,
        table: {
          isActive: true,
          restaurant: { status: { in: ['ACTIVE', 'TRIAL'] } },
        },
      },
      include: {
        table: {
          include: {
            restaurant: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                currency: true,
                isOpen: true,
                allowOrders: true,
                allowWaiterCalls: true,
                allowBillRequests: true,
              },
            },
          },
        },
      },
    });

    if (!qr) throw new NotFoundException('QR-код недействителен');
    return qr;
  }

  // ─── Waiter Calls ────────────────────────────────────────────────────────

  async createCall(tableId: string, type: WaiterCallType, orderId?: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, isActive: true },
    });
    if (!table) throw new NotFoundException('Стол не найден');

    const activeCall = await this.prisma.waiterCall.findFirst({
      where: {
        tableId,
        type,
        orderId: orderId ?? null,
        status: WaiterCallStatus.PENDING,
      },
    });
    if (activeCall) return activeCall;

    const call = await this.prisma.waiterCall.create({
      data: { tableId, type, orderId },
      include: { table: { select: { number: true, restaurantId: true, waiterId: true } } },
    });

    const newTableStatus = type === WaiterCallType.CALL
      ? TableStatus.CALLING_WAITER
      : TableStatus.BILL_REQUESTED;

    await this.prisma.table.update({ where: { id: tableId }, data: { status: newTableStatus } });

    const { restaurantId, waiterId } = call.table;
    const event = type === WaiterCallType.CALL ? WsEvent.WAITER_CALLED : WsEvent.BILL_REQUESTED;

    this.gateway.emitToAllRestaurantStaff(restaurantId, event, call);
    this.gateway.emitToCashier(restaurantId, event, call);
    if (waiterId) {
      this.gateway.emitToWaiter(restaurantId, waiterId, event, call);
    }

    return call;
  }

  async closeCall(callId: string, restaurantId: string) {
    const call = await this.prisma.waiterCall.findFirst({
      where: { id: callId },
      include: { table: true },
    });
    if (!call || call.table.restaurantId !== restaurantId) {
      throw new NotFoundException('Вызов не найден');
    }

    return this.prisma.waiterCall.update({
      where: { id: callId },
      data: { status: WaiterCallStatus.CLOSED, closedAt: new Date() },
    });
  }

  async getActiveCalls(restaurantId: string) {
    return this.prisma.waiterCall.findMany({
      where: {
        status: WaiterCallStatus.PENDING,
        table: { restaurantId },
      },
      include: { table: { select: { number: true, hallId: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async ensureTableBelongsTo(tableId: string, restaurantId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, restaurantId, isActive: true },
    });
    if (!table) throw new NotFoundException('Стол не найден');
    return table;
  }

  private async validateAssignments(
    restaurantId: string,
    hallId?: string,
    waiterId?: string,
  ) {
    if (hallId) {
      const hall = await this.prisma.hall.findFirst({
        where: { id: hallId, restaurantId },
      });
      if (!hall) throw new NotFoundException('Hall not found');
    }

    if (waiterId) {
      const waiter = await this.prisma.user.findFirst({
        where: {
          id: waiterId,
          restaurantId,
          role: 'WAITER',
          isActive: true,
        },
      });
      if (!waiter) throw new NotFoundException('Waiter not found');
    }
  }
}
