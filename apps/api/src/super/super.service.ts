import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

function temporaryPassword() {
  const words = ['Nura', 'Taza', 'Kora', 'Berk', 'Sapa'];
  return `Admin-${randomInt(23, 99)}${words[randomInt(0, words.length)]}!`;
}

@Injectable()
export class SuperService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdminUser(data: {
    restaurantId: string;
    name: string;
    phone?: string;
    login: string;
    email: string;
    password: string;
  }, superAdminId: string) {
    const login = data.login.trim().toLowerCase();
    const email = data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(data.password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const restaurant = await tx.restaurant.findUnique({
          where: { id: data.restaurantId },
          select: { id: true, adminLimit: true },
        });
        if (!restaurant) throw new NotFoundException('Ресторан не найден');

        const [adminCount, loginExists, emailExists] = await Promise.all([
          tx.user.count({ where: { restaurantId: data.restaurantId, role: Role.ADMIN } }),
          tx.user.findUnique({ where: { login }, select: { id: true } }),
          tx.user.findUnique({ where: { email }, select: { id: true } }),
        ]);
        if (adminCount >= restaurant.adminLimit) {
          throw new ConflictException('Лимит администраторов для этого ресторана достигнут.');
        }
        if (loginExists) throw new ConflictException('Логин уже занят.');
        if (emailExists) throw new ConflictException('Email уже занят.');

        const admin = await tx.user.create({
          data: {
            restaurantId: data.restaurantId,
            role: Role.ADMIN,
            name: data.name.trim(),
            phone: data.phone?.trim() || null,
            login,
            email,
            passwordHash,
          },
          select: { id: true, name: true, phone: true, login: true, email: true, role: true, isActive: true, createdAt: true },
        });
        await tx.auditLog.create({
          data: { userId: superAdminId, restaurantId: data.restaurantId, action: 'restaurant_admin_created', entity: 'User', entityId: admin.id },
        });
        return admin;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        if (target.includes('email')) throw new ConflictException('Email уже занят.');
        throw new ConflictException('Логин уже занят.');
      }
      throw error;
    }
  }

  async listAllUsers(params: { role?: Role; restaurantId?: string; skip?: number; take?: number }) {
    const { role, restaurantId, skip = 0, take = 50 } = params;
    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (restaurantId) where.restaurantId = restaurantId;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          login: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          restaurantId: true,
          createdAt: true,
          restaurant: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async toggleUserActive(userId: string, isActive: boolean, actorId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isActive },
        select: { id: true, name: true, isActive: true },
      });
      if (!isActive) {
        await tx.userSession.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false, revokedAt: new Date(), endReason: 'revoked_by_super_admin' },
        });
      }
      if (actorId && user.restaurantId) {
        await tx.auditLog.create({
          data: { userId: actorId, restaurantId: user.restaurantId, action: isActive ? 'user_activated' : 'user_deactivated', entity: 'User', entityId: userId },
        });
      }
      return updated;
    });
  }

  async revokeUserSessions(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === Role.SUPER_ADMIN || !user.restaurantId) {
      throw new NotFoundException('Пользователь ресторана не найден');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.userSession.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, revokedAt: new Date(), endReason: 'revoked_by_super_admin' },
      });
      await tx.auditLog.create({
        data: { userId: actorId, restaurantId: user.restaurantId, action: 'user_sessions_revoked', entity: 'User', entityId: userId, diff: { count: revoked.count } },
      });
      return revoked;
    });
    return { success: true, revokedCount: result.count };
  }

  async resetUserPassword(userId: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === Role.SUPER_ADMIN || !user.restaurantId) {
      throw new NotFoundException('Пользователь ресторана не найден');
    }
    const password = temporaryPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.userSession.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, revokedAt: new Date(), endReason: 'revoked_by_super_admin' },
      });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.auditLog.create({
        data: { userId: actorId, restaurantId: user.restaurantId, action: 'user_password_reset', entity: 'User', entityId: userId },
      });
    });
    return { userId, password };
  }

  // Plans
  async getPlans() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  async createPlan(data: {
    name: string;
    price: number;
    periodDays: number;
    limits: object;
  }) {
    return this.prisma.plan.create({ data: { ...data, isActive: true } });
  }

  async updatePlan(id: string, data: Partial<{
    name: string;
    price: number;
    periodDays: number;
    limits: object;
    isActive: boolean;
  }>) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Тариф не найден');
    return this.prisma.plan.update({ where: { id }, data });
  }

  // Subscriptions
  async assignSubscription(data: {
    restaurantId: string;
    planId: string;
    days: number;
  }) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: data.restaurantId } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');

    const plan = await this.prisma.plan.findUnique({ where: { id: data.planId } });
    if (!plan) throw new NotFoundException('Тариф не найден');

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + data.days * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { restaurantId: data.restaurantId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      const subscription = await tx.subscription.create({
        data: {
          restaurantId: data.restaurantId,
          planId: data.planId,
          startsAt,
          endsAt,
          status: 'ACTIVE',
        },
        include: { plan: { select: { name: true } } },
      });
      await tx.restaurant.update({
        where: { id: data.restaurantId },
        data: { tariffId: data.planId, subscriptionEndsAt: endsAt },
      });
      return subscription;
    });
  }

  async listSubscriptions() {
    return this.prisma.subscription.findMany({
      include: {
        restaurant: { select: { id: true, name: true, status: true } },
        plan: { select: { id: true, name: true, price: true } },
      },
      orderBy: { endsAt: 'asc' },
    });
  }

  async extendSubscription(id: string, days: number) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const base =
      subscription.endsAt > new Date() ? subscription.endsAt : new Date();
    const endsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: { endsAt, status: 'ACTIVE' },
        include: {
          restaurant: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } },
        },
      });
      await tx.restaurant.update({
        where: { id: subscription.restaurantId },
        data: { tariffId: subscription.planId, subscriptionEndsAt: endsAt },
      });
      return updated;
    });
  }

  async getPlatformStats() {
    const [totalRestaurants, activeRestaurants, totalOrders, totalRevenue] = await Promise.all([
      this.prisma.restaurant.count(),
      this.prisma.restaurant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count({ where: { status: { notIn: ['CANCELLED'] } } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalRestaurants,
      activeRestaurants,
      totalOrders,
      totalRevenue: Number(totalRevenue._sum.amount ?? 0),
    };
  }
}
