import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  TableStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { MenuFlowGateway, WsEvent } from '../gateway/menuflow.gateway';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenuFlowGateway,
    private readonly audit: AuditService,
  ) {}

  async createPayment(params: {
    orderId: string;
    restaurantId: string;
    method: PaymentMethod;
    amount: number;
    createdById: string;
  }) {
    const amount = new Decimal(params.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const payment = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: params.orderId, restaurantId: params.restaurantId },
          include: {
            payments: {
              where: { status: PaymentStatus.COMPLETED },
              select: { id: true },
            },
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.payments.length > 0) {
          throw new BadRequestException('Order is already paid');
        }
        if (
          !(
            [OrderStatus.SERVED, OrderStatus.BILL_REQUESTED] as OrderStatus[]
          ).includes(order.status)
        ) {
          throw new BadRequestException('Order is not ready for payment');
        }
        if (amount.lessThan(order.total)) {
          throw new BadRequestException('Payment amount is below order total');
        }

        const created = await tx.payment.create({
          data: {
            orderId: params.orderId,
            method: params.method,
            amount,
            status: PaymentStatus.COMPLETED,
            createdById: params.createdById,
          },
        });
        await tx.order.update({
          where: { id: params.orderId },
          data: {
            status: OrderStatus.PAID,
            statusHistory: {
              create: {
                fromStatus: order.status,
                toStatus: OrderStatus.PAID,
                changedById: params.createdById,
              },
            },
          },
        });
        await tx.table.update({
          where: { id: order.tableId },
          data: { status: TableStatus.NEEDS_CLEANING },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.gateway.emitToOrder(params.orderId, WsEvent.ORDER_PAID, {
      orderId: params.orderId,
    });
    this.gateway.emitToAllRestaurantStaff(
      params.restaurantId,
      WsEvent.ORDER_PAID,
      { orderId: params.orderId },
    );
    await this.audit.log({
      userId: params.createdById,
      restaurantId: params.restaurantId,
      action: 'PAYMENT_CREATED',
      entity: 'Payment',
      entityId: payment.id,
      diff: { method: params.method, amount: params.amount },
    });
    return payment;
  }

  async cancelPayment(
    paymentId: string,
    restaurantId: string,
    reason: string,
    userId: string,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { restaurantId } },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('Payment is already cancelled');
    }
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.CANCELLED, cancelledReason: reason },
    });
    await this.audit.log({
      userId,
      restaurantId,
      action: 'PAYMENT_CANCELLED',
      entity: 'Payment',
      entityId: paymentId,
      diff: { reason },
    });
    return updated;
  }

  async getDailyReport(restaurantId: string, date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.COMPLETED,
        createdAt: { gte: start, lte: end },
        order: { restaurantId },
      },
      include: { order: { select: { id: true, tableId: true } } },
    });
    const total = payments.reduce((sum, item) => sum + Number(item.amount), 0);
    const byMethod = payments.reduce(
      (result, item) => {
        result[item.method] =
          (result[item.method] ?? 0) + Number(item.amount);
        return result;
      },
      {} as Record<string, number>,
    );
    return { payments, total, byMethod, count: payments.length };
  }

  async getUnpaidOrders(restaurantId: string) {
    return this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: [OrderStatus.SERVED, OrderStatus.BILL_REQUESTED] },
        payments: { none: { status: PaymentStatus.COMPLETED } },
      },
      include: {
        items: { include: { dish: { select: { name: true } } } },
        table: { select: { number: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
