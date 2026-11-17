import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

export enum WsEvent {
  ORDER_NEW = 'order:new',
  ORDER_UPDATED = 'order:updated',
  ORDER_CANCELLED = 'order:cancelled',
  ORDER_ACCEPTED = 'order:accepted',
  ORDER_READY = 'order:ready',
  ORDER_DELIVERED = 'order:delivered',
  ORDER_PAID = 'order:paid',
  ITEM_STATUS_CHANGED = 'item:status_changed',
  WAITER_CALLED = 'waiter:called',
  BILL_REQUESTED = 'bill:requested',
  CALL_CLOSED = 'call:closed',
  DISH_STOPLIST_CHANGED = 'dish:stoplist_changed',
  MENU_UPDATED = 'menu:updated',
  TABLE_STATUS_CHANGED = 'table:status_changed',
  SUBSCRIPTION_EXPIRING = 'subscription:expiring',
  SUBSCRIPTION_EXPIRED = 'subscription:expired',
  RESTAURANT_BLOCKED = 'restaurant:blocked',
  NEW_SUPPORT_TICKET = 'support:new_ticket',
  CONNECTED = 'connected',
  ERROR = 'error',
}

const socketOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

@WebSocketGateway({
  cors: {
    origin: socketOrigins,
    credentials: true,
  },
  namespace: '/',
})
export class MenuFlowGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MenuFlowGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      client.data.isGuest = true;
      client.emit(WsEvent.CONNECTED, { socketId: client.id, guest: true });
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.cfg.getOrThrow('JWT_SECRET'),
      });
      if (!payload.sessionId) throw new Error('Session is missing');
      const session = await this.prisma.userSession.findUnique({
        where: { sessionId: payload.sessionId },
        select: { userId: true, isActive: true, expiresAt: true },
      });
      if (
        !session ||
        session.userId !== payload.sub ||
        !session.isActive ||
        session.expiresAt <= new Date()
      ) {
        throw new Error('Session expired');
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          restaurantId: true,
          isActive: true,
          restaurant: {
            select: {
              status: true,
              subscriptions: {
                where: {
                  status: { in: ['ACTIVE', 'TRIAL'] },
                  endsAt: { gt: new Date() },
                },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!user?.isActive) throw new Error('Inactive user');
      if (
        user.role !== 'SUPER_ADMIN' &&
        (
          !user.restaurantId ||
          !user.restaurant ||
          !['ACTIVE', 'TRIAL'].includes(user.restaurant.status) ||
          user.restaurant.subscriptions.length === 0
        )
      ) {
        throw new Error('Restaurant access disabled');
      }

      client.data.userId = user.id;
      client.data.role = user.role;
      client.data.restaurantId = user.restaurantId;

      if (user.role === 'SUPER_ADMIN') {
        await client.join('super');
      } else if (user.restaurantId) {
        await client.join(`restaurant:${user.restaurantId}:staff`);
        await client.join(
          `restaurant:${user.restaurantId}:${user.role.toLowerCase()}`,
        );
        if (user.role === 'WAITER') {
          await client.join(
            `restaurant:${user.restaurantId}:waiter:${user.id}`,
          );
        }
      }
      client.emit(WsEvent.CONNECTED, { socketId: client.id, guest: false });
    } catch {
      client.emit(WsEvent.ERROR, { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe:order')
  async subscribeToOrder(
    @MessageBody() data: { publicToken?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.publicToken) {
      client.emit(WsEvent.ERROR, { message: 'Order token is required' });
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { publicToken: data.publicToken },
      select: { id: true, restaurantId: true },
    });
    if (!order) {
      client.emit(WsEvent.ERROR, { message: 'Order not found' });
      return;
    }
    if (
      client.data.restaurantId &&
      client.data.restaurantId !== order.restaurantId &&
      client.data.role !== 'SUPER_ADMIN'
    ) {
      client.emit(WsEvent.ERROR, { message: 'Access denied' });
      return;
    }
    await client.join(`order:${order.id}`);
  }

  emitToRestaurant(
    restaurantId: string,
    role: string,
    event: WsEvent,
    data: unknown,
  ) {
    this.emitToRoom(
      `restaurant:${restaurantId}:${role.toLowerCase()}`,
      event,
      data,
    );
  }

  private emitToRoom(room: string, event: WsEvent, data: unknown) {
    if (!this.server) {
      this.logger.warn(`WebSocket server is not ready; skipped ${event}`);
      return;
    }
    this.server.to(room).emit(event, data);
  }

  emitToAllRestaurantStaff(
    restaurantId: string,
    event: WsEvent,
    data: unknown,
  ) {
    this.emitToRoom(`restaurant:${restaurantId}:staff`, event, data);
  }

  emitToWaiter(
    restaurantId: string,
    waiterId: string,
    event: WsEvent,
    data: unknown,
  ) {
    this.emitToRoom(
      `restaurant:${restaurantId}:waiter:${waiterId}`,
      event,
      data,
    );
  }

  emitToOrder(orderId: string, event: WsEvent, data: unknown) {
    this.emitToRoom(`order:${orderId}`, event, data);
  }

  emitToSuper(event: WsEvent, data: unknown) {
    this.emitToRoom('super', event, data);
  }

  emitToKitchen(restaurantId: string, event: WsEvent, data: unknown) {
    this.emitToRoom(`restaurant:${restaurantId}:cook`, event, data);
  }

  emitToCashier(restaurantId: string, event: WsEvent, data: unknown) {
    this.emitToRoom(`restaurant:${restaurantId}:cashier`, event, data);
  }
}
