import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderItemStatus,
  OrderStatus,
  Prisma,
  Role,
  TableStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { MenuFlowGateway, WsEvent } from '../gateway/menuflow.gateway';
import { AuditService } from '../audit/audit.service';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  ACCEPTED: [
    OrderStatus.COOKING,
    OrderStatus.CANCEL_REQUESTED,
    OrderStatus.CANCELLED,
  ],
  COOKING: [OrderStatus.READY, OrderStatus.CANCEL_REQUESTED],
  READY: [OrderStatus.DELIVERING, OrderStatus.CANCEL_REQUESTED],
  DELIVERING: [OrderStatus.SERVED],
  SERVED: [OrderStatus.BILL_REQUESTED, OrderStatus.PAID],
  BILL_REQUESTED: [OrderStatus.PAID],
  PAID: [OrderStatus.CLOSED],
  CLOSED: [],
  CANCEL_REQUESTED: [OrderStatus.CANCELLED, OrderStatus.ACCEPTED],
  CANCELLED: [],
};

export interface CreateOrderDto {
  restaurantId: string;
  tableId: string;
  waiterId?: string;
  clientComment?: string;
  items: {
    dishId: string;
    variantId?: string;
    qty: number;
    comment?: string;
    addonIds?: string[];
  }[];
}

type OrderItemInput = CreateOrderDto['items'][number];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenuFlowGateway,
    private readonly audit: AuditService,
  ) {}

  async createOrder(dto: CreateOrderDto, createdByUserId?: string) {
    if (!dto.items?.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      select: {
        status: true,
        isOpen: true,
        subscriptions: {
          where: {
            status: { in: ['ACTIVE', 'TRIAL'] },
            endsAt: { gt: new Date() },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!restaurant || !['ACTIVE', 'TRIAL'].includes(restaurant.status)) {
      throw new BadRequestException('Restaurant is unavailable');
    }
    if (!restaurant.isOpen) {
      throw new BadRequestException('Restaurant is currently closed');
    }
    if (restaurant.subscriptions.length === 0) {
      throw new BadRequestException('Restaurant subscription is inactive');
    }

    const table = await this.prisma.table.findFirst({
      where: {
        id: dto.tableId,
        restaurantId: dto.restaurantId,
        isActive: true,
      },
    });
    if (!table) throw new NotFoundException('Table not found');

    if (dto.waiterId) {
      const waiter = await this.prisma.user.findFirst({
        where: {
          id: dto.waiterId,
          restaurantId: dto.restaurantId,
          role: Role.WAITER,
          isActive: true,
        },
      });
      if (!waiter) throw new BadRequestException('Assigned waiter is invalid');
    }

    const pricedItems = await this.priceItems(dto.restaurantId, dto.items);
    const total = pricedItems.reduce(
      (sum, item) => sum.add(item.priceAtMoment.mul(item.qty)),
      new Decimal(0),
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          restaurantId: dto.restaurantId,
          tableId: dto.tableId,
          waiterId: dto.waiterId ?? null,
          clientComment: dto.clientComment ?? null,
          total,
          items: {
            create: pricedItems.map((item) => ({
              dishId: item.dishId,
              variantId: item.variantId,
              qty: item.qty,
              priceAtMoment: item.priceAtMoment,
              comment: item.comment,
              addons: { create: item.addons },
            })),
          },
          statusHistory: {
            create: {
              toStatus: OrderStatus.NEW,
              changedById: createdByUserId ?? null,
            },
          },
        },
        include: {
          items: {
            include: {
              dish: true,
              variant: true,
              addons: { include: { addon: true } },
            },
          },
          table: { select: { number: true } },
        },
      });
      await tx.table.update({
        where: { id: dto.tableId },
        data: { status: TableStatus.OCCUPIED },
      });
      return created;
    });

    this.gateway.emitToAllRestaurantStaff(
      dto.restaurantId,
      WsEvent.ORDER_NEW,
      order,
    );
    this.gateway.emitToKitchen(dto.restaurantId, WsEvent.ORDER_NEW, order);
    if (dto.waiterId) {
      this.gateway.emitToWaiter(
        dto.restaurantId,
        dto.waiterId,
        WsEvent.ORDER_NEW,
        order,
      );
    }
    return order;
  }

  async changeStatus(
    orderId: string,
    restaurantId: string,
    newStatus: OrderStatus,
    changedById?: string,
    cancelReason?: string,
  ) {
    const order = await this.getOrder(orderId, restaurantId);
    if (!ALLOWED_TRANSITIONS[order.status].includes(newStatus)) {
      throw new ConflictException(
        `Transition ${order.status} -> ${newStatus} is not allowed`,
      );
    }
    if (
      (
        [OrderStatus.CANCELLED, OrderStatus.CANCEL_REQUESTED] as OrderStatus[]
      ).includes(newStatus) &&
      !cancelReason?.trim()
    ) {
      throw new BadRequestException('Cancellation reason is required');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          closedAt: newStatus === OrderStatus.CLOSED ? new Date() : undefined,
          statusHistory: {
            create: {
              fromStatus: order.status,
              toStatus: newStatus,
              changedById: changedById ?? null,
            },
          },
        },
        include: {
          items: { include: { dish: true, variant: true } },
          table: { select: { number: true, id: true } },
        },
      });
      const tableStatus = this.getTableStatusForOrderStatus(newStatus);
      if (tableStatus) {
        await tx.table.update({
          where: { id: order.tableId },
          data: { status: tableStatus },
        });
      }
      return changed;
    });

    this.gateway.emitToOrder(orderId, WsEvent.ORDER_UPDATED, updated);
    this.gateway.emitToAllRestaurantStaff(
      restaurantId,
      WsEvent.ORDER_UPDATED,
      updated,
    );
    if (newStatus === OrderStatus.READY) {
      this.gateway.emitToAllRestaurantStaff(
        restaurantId,
        WsEvent.ORDER_READY,
        updated,
      );
    }
    if (newStatus === OrderStatus.BILL_REQUESTED) {
      this.gateway.emitToCashier(
        restaurantId,
        WsEvent.BILL_REQUESTED,
        updated,
      );
    }
    if (newStatus === OrderStatus.PAID) {
      this.gateway.emitToOrder(orderId, WsEvent.ORDER_PAID, updated);
    }

    await this.audit.log({
      userId: changedById,
      restaurantId,
      action: 'ORDER_STATUS_CHANGED',
      entity: 'Order',
      entityId: orderId,
      diff: { from: order.status, to: newStatus, reason: cancelReason },
    });
    return updated;
  }

  async changeStatusAsWaiter(
    orderId: string,
    restaurantId: string,
    waiterId: string,
    newStatus: OrderStatus,
    reason?: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { waiterId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.waiterId && order.waiterId !== waiterId) {
      throw new ForbiddenException('Order is assigned to another waiter');
    }
    if (newStatus === OrderStatus.ACCEPTED && !order.waiterId) {
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, waiterId: null },
        data: { waiterId },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Order was accepted by another waiter');
      }
    }
    return this.changeStatus(orderId, restaurantId, newStatus, waiterId, reason);
  }

  async getOrders(
    restaurantId: string,
    params: {
      status?: OrderStatus | OrderStatus[];
      tableId?: string;
      waiterId?: string;
      visibleToWaiterId?: string;
      skip?: number;
      take?: number;
      from?: Date;
      to?: Date;
    } = {},
  ) {
    const {
      status,
      tableId,
      waiterId,
      visibleToWaiterId,
      skip = 0,
      take = 50,
      from,
      to,
    } = params;
    const where: Prisma.OrderWhereInput = {
      restaurantId,
      ...(status
        ? { status: Array.isArray(status) ? { in: status } : status }
        : {}),
      ...(tableId ? { tableId } : {}),
      ...(waiterId ? { waiterId } : {}),
      ...(visibleToWaiterId
        ? { OR: [{ waiterId: visibleToWaiterId }, { waiterId: null }] }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              dish: { select: { name: true, photoUrl: true } },
              variant: true,
              addons: { include: { addon: true } },
            },
          },
          table: { select: { number: true } },
          waiter: { select: { name: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, skip, take };
  }

  async getOrder(orderId: string, restaurantId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          include: {
            dish: true,
            variant: true,
            addons: { include: { addon: true } },
          },
        },
        table: { select: { number: true, id: true } },
        waiter: { select: { id: true, name: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payments: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getOrderForWaiter(
    orderId: string,
    restaurantId: string,
    waiterId: string,
  ) {
    const order = await this.getOrder(orderId, restaurantId);
    if (order.waiterId && order.waiterId !== waiterId) {
      throw new ForbiddenException('Order is assigned to another waiter');
    }
    return order;
  }

  async getPublicOrderStatus(publicToken: string) {
    const order = await this.prisma.order.findUnique({
      where: { publicToken },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        clientComment: true,
        items: {
          select: {
            id: true,
            qty: true,
            status: true,
            dish: { select: { name: true, photoUrl: true } },
            variant: { select: { name: true } },
          },
        },
        statusHistory: {
          select: { toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async requestBill(publicToken: string, tableId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        publicToken,
        tableId,
        status: { notIn: [OrderStatus.CLOSED, OrderStatus.CANCELLED] },
      },
      select: { id: true, restaurantId: true, status: true },
    });
    if (!order) throw new NotFoundException('Active order not found');
    if (order.status === OrderStatus.BILL_REQUESTED) return order;
    if (order.status !== OrderStatus.SERVED) {
      throw new BadRequestException('Bill can be requested after service');
    }
    await this.changeStatus(
      order.id,
      order.restaurantId,
      OrderStatus.BILL_REQUESTED,
    );
    return order;
  }

  async updateItemStatus(
    orderId: string,
    restaurantId: string,
    itemId: string,
    status: OrderItemStatus,
    changedById?: string,
  ) {
    const order = await this.getOrder(orderId, restaurantId);
    const item = order.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    const updated = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { status },
    });
    this.gateway.emitToAllRestaurantStaff(
      restaurantId,
      WsEvent.ITEM_STATUS_CHANGED,
      { orderId, itemId, status },
    );

    if (status === OrderItemStatus.READY) {
      const activeItems = await this.prisma.orderItem.findMany({
        where: { orderId, status: { not: OrderItemStatus.CANCELLED } },
      });
      const allReady = activeItems.every(
        (candidate) =>
          candidate.id === itemId ||
          (
            [OrderItemStatus.READY, OrderItemStatus.SERVED] as OrderItemStatus[]
          ).includes(candidate.status),
      );
      if (allReady && order.status === OrderStatus.COOKING) {
        await this.changeStatus(
          orderId,
          restaurantId,
          OrderStatus.READY,
          changedById,
        );
      }
    }
    return updated;
  }

  async addItem(
    orderId: string,
    restaurantId: string,
    item: OrderItemInput,
  ) {
    const order = await this.getOrder(orderId, restaurantId);
    if (
      !([OrderStatus.NEW, OrderStatus.ACCEPTED] as OrderStatus[]).includes(
        order.status,
      )
    ) {
      throw new BadRequestException(
        'Items can be added only before cooking starts',
      );
    }
    const [priced] = await this.priceItems(restaurantId, [item]);
    const newItem = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orderItem.create({
        data: {
          orderId,
          dishId: priced.dishId,
          variantId: priced.variantId,
          qty: priced.qty,
          priceAtMoment: priced.priceAtMoment,
          comment: priced.comment,
          addons: { create: priced.addons },
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          total: order.total.add(priced.priceAtMoment.mul(priced.qty)),
        },
      });
      return created;
    });
    this.gateway.emitToAllRestaurantStaff(
      restaurantId,
      WsEvent.ORDER_UPDATED,
      { orderId },
    );
    return newItem;
  }

  private async priceItems(restaurantId: string, items: OrderItemInput[]) {
    for (const item of items) {
      if (!Number.isInteger(item.qty) || item.qty <= 0) {
        throw new BadRequestException('Quantity must be a positive integer');
      }
    }

    const dishIds = [...new Set(items.map((item) => item.dishId))];
    const variantIds = [
      ...new Set(items.flatMap((item) => (item.variantId ? [item.variantId] : []))),
    ];
    const addonIds = [
      ...new Set(items.flatMap((item) => item.addonIds ?? [])),
    ];
    const [dishes, variants, addons] = await Promise.all([
      this.prisma.dish.findMany({
        where: {
          id: { in: dishIds },
          restaurantId,
          isActive: true,
          isVisible: true,
        },
      }),
      variantIds.length
        ? this.prisma.dishVariant.findMany({
            where: { id: { in: variantIds }, isActive: true },
          })
        : Promise.resolve([]),
      addonIds.length
        ? this.prisma.dishAddon.findMany({
            where: { id: { in: addonIds }, isActive: true },
          })
        : Promise.resolve([]),
    ]);

    if (dishes.length !== dishIds.length) {
      throw new BadRequestException('One or more dishes are unavailable');
    }
    const dishMap = new Map(dishes.map((dish) => [dish.id, dish]));
    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const addonMap = new Map(addons.map((addon) => [addon.id, addon]));

    return items.map((item) => {
      const dish = dishMap.get(item.dishId);
      if (!dish || dish.inStoplist) {
        throw new BadRequestException('Dish is unavailable');
      }
      const variant = item.variantId
        ? variantMap.get(item.variantId)
        : undefined;
      if (item.variantId && (!variant || variant.dishId !== item.dishId)) {
        throw new BadRequestException('Variant does not belong to the dish');
      }
      const selectedAddons = [...new Set(item.addonIds ?? [])].map((addonId) => {
        const addon = addonMap.get(addonId);
        if (!addon || addon.dishId !== item.dishId) {
          throw new BadRequestException('Addon does not belong to the dish');
        }
        return addon;
      });
      const addonTotal = selectedAddons.reduce(
        (sum, addon) => sum.add(addon.price),
        new Decimal(0),
      );
      const priceAtMoment = dish.price
        .add(variant?.priceDelta ?? 0)
        .add(addonTotal);
      return {
        dishId: item.dishId,
        variantId: item.variantId ?? null,
        qty: item.qty,
        priceAtMoment,
        comment: item.comment ?? null,
        addons: selectedAddons.map((addon) => ({
          addonId: addon.id,
          priceAtMoment: addon.price,
        })),
      };
    });
  }

  private getTableStatusForOrderStatus(
    status: OrderStatus,
  ): TableStatus | null {
    const map: Partial<Record<OrderStatus, TableStatus>> = {
      NEW: TableStatus.OCCUPIED,
      ACCEPTED: TableStatus.OCCUPIED,
      COOKING: TableStatus.ORDER_COOKING,
      READY: TableStatus.ORDER_READY,
      BILL_REQUESTED: TableStatus.BILL_REQUESTED,
      CLOSED: TableStatus.NEEDS_CLEANING,
      CANCELLED: TableStatus.FREE,
    };
    return map[status] ?? null;
  }
}
