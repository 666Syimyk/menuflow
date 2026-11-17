import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminSessionPolicy,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RestaurantStatus,
  Role,
  SubscriptionStatus,
} from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { CreateRestaurantDto } from './restaurants.controller';

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', қ: 'k', ғ: 'g',
  ү: 'u', ұ: 'u', ң: 'n', ө: 'o', һ: 'h', і: 'i',
};

function transliterate(value: string) {
  return value
    .toLowerCase()
    .split('')
    .map((char) => CYRILLIC_MAP[char] ?? char)
    .join('');
}

function slugify(value: string) {
  return transliterate(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'restaurant';
}

function adminBase(value: string) {
  const parts = slugify(value)
    .split('-')
    .filter((part) => !['kafe', 'cafe', 'restoran', 'restaurant'].includes(part));
  return (parts.join('_') || 'restaurant').slice(0, 18);
}

function generateReadablePassword(base: string) {
  const safeBase = base.replace(/[^a-z]/gi, '').slice(0, 8) || 'Menu';
  const capitalized = safeBase[0].toUpperCase() + safeBase.slice(1).toLowerCase();
  const words = ['Nura', 'Taza', 'Kora', 'Berk', 'Sapa'];
  return `${capitalized}-${randomInt(23, 99)}${words[randomInt(0, words.length)]}!`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function fourteenDaysAgo() {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
}

function periodDate(period?: string) {
  if (period === 'today') return startOfToday();
  if (period === '14d') return fourteenDaysAgo();
  return undefined;
}

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { status?: RestaurantStatus; skip?: number; take?: number }) {
    const { status, skip = 0, take = 20 } = params;
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tables: true, users: true, orders: true } },
          subscriptions: {
            where: { status: 'ACTIVE' },
            include: { plan: { select: { name: true } } },
            take: 1,
          },
          users: {
            where: { role: Role.ADMIN },
            select: {
              name: true,
              sessions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    return {
      items: items.map((item) => {
        const lastAdmin = item.users
          .filter((user) => user.sessions[0])
          .sort((a, b) => b.sessions[0].createdAt.getTime() - a.sessions[0].createdAt.getTime())[0];
        const { users: _users, ...restaurant } = item;
        return {
          ...restaurant,
          lastAdminLogin: lastAdmin
            ? { name: lastAdmin.name, at: lastAdmin.sessions[0].createdAt }
            : null,
        };
      }),
      total,
      skip,
      take,
    };
  }

  async getDetails(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        _count: { select: { tables: true, users: true, orders: true } },
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: true },
          take: 1,
        },
      },
    });

    if (!restaurant) throw new NotFoundException('Ресторан не найден');
    const [lastOrder, lastCall, lastFeedback, lastAdminLogin, lastStaffLogin] = await Promise.all([
      this.prisma.order.findFirst({ where: { restaurantId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, status: true } }),
      this.prisma.waiterCall.findFirst({ where: { table: { restaurantId: id } }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, type: true } }),
      this.prisma.feedback.findFirst({ where: { restaurantId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, rating: true } }),
      this.prisma.userSession.findFirst({ where: { restaurantId: id, role: Role.ADMIN }, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, login: true } } } }),
      this.prisma.userSession.findFirst({ where: { restaurantId: id }, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, login: true, role: true } } } }),
    ]);
    return { restaurant, lastActivity: { lastOrder, lastCall, lastFeedback, lastAdminLogin, lastStaffLogin } };
  }

  async findOne(id: string) {
    const details = await this.getDetails(id);
    return details.restaurant;
  }

  async getSummary(id: string) {
    await this.ensureRestaurant(id);
    const today = startOfToday();
    const last14 = fourteenDaysAgo();
    const [
      adminsCount, staffCount, waitersCount, cooksCount, cashiersCount,
      tablesCount, activeTablesCount, ordersTotal, ordersToday, ordersLast14,
      paymentsToday, paymentsLast14, unpaidOrders, lastAdminLogin, lastStaffLogin,
      loginsLast14,
    ] = await Promise.all([
      this.prisma.user.count({ where: { restaurantId: id, role: Role.ADMIN } }),
      this.prisma.user.count({ where: { restaurantId: id } }),
      this.prisma.user.count({ where: { restaurantId: id, role: Role.WAITER } }),
      this.prisma.user.count({ where: { restaurantId: id, role: Role.COOK } }),
      this.prisma.user.count({ where: { restaurantId: id, role: Role.CASHIER } }),
      this.prisma.table.count({ where: { restaurantId: id } }),
      this.prisma.table.count({ where: { restaurantId: id, isActive: true } }),
      this.prisma.order.count({ where: { restaurantId: id } }),
      this.prisma.order.count({ where: { restaurantId: id, createdAt: { gte: today } } }),
      this.prisma.order.count({ where: { restaurantId: id, createdAt: { gte: last14 } } }),
      this.prisma.payment.aggregate({ where: { order: { restaurantId: id }, status: PaymentStatus.COMPLETED, createdAt: { gte: today } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { order: { restaurantId: id }, status: PaymentStatus.COMPLETED, createdAt: { gte: last14 } }, _sum: { amount: true } }),
      this.prisma.order.count({ where: { restaurantId: id, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.CLOSED] }, payments: { none: { status: PaymentStatus.COMPLETED } } } }),
      this.prisma.userSession.findFirst({ where: { restaurantId: id, role: Role.ADMIN }, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, login: true } } } }),
      this.prisma.userSession.findFirst({ where: { restaurantId: id }, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true, login: true, role: true } } } }),
      this.prisma.userSession.count({ where: { restaurantId: id, createdAt: { gte: last14 } } }),
    ]);
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id }, select: { adminLimit: true } });
    return {
      adminsCount, adminLimit: restaurant!.adminLimit, staffCount, waitersCount, cooksCount, cashiersCount,
      tablesCount, activeTablesCount, inactiveTablesCount: tablesCount - activeTablesCount,
      ordersTotal, ordersToday, ordersLast14Days: ordersLast14,
      paymentsToday: Number(paymentsToday._sum.amount ?? 0),
      paymentsLast14Days: Number(paymentsLast14._sum.amount ?? 0),
      unpaidOrders, lastAdminLogin, lastStaffLogin, loginsLast14Days: loginsLast14,
    };
  }

  async getRestaurantUsers(id: string, adminsOnly = false) {
    await this.ensureRestaurant(id);
    const users = await this.prisma.user.findMany({
      where: { restaurantId: id, ...(adminsOnly ? { role: Role.ADMIN } : {}) },
      select: { id: true, name: true, login: true, email: true, phone: true, role: true, isActive: true, createdAt: true, sessions: { orderBy: { createdAt: 'desc' }, take: 100 } },
      orderBy: { createdAt: 'desc' },
    });
    const last14 = fourteenDaysAgo();
    return users.map((user) => {
      const lastLogin = user.sessions[0] ?? null;
      const activeSessionCount = user.sessions.filter((session) => session.isActive && session.expiresAt > new Date()).length;
      const loginCountLast14Days = user.sessions.filter((session) => session.createdAt >= last14).length;
      const { sessions: _sessions, ...safeUser } = user;
      return { ...safeUser, lastLogin, activeSessionCount, loginCountLast14Days };
    });
  }

  async getRestaurantStaff(id: string, query: { role?: string; status?: string }) {
    const users = await this.getRestaurantUsers(id, false);
    return users.filter((user) =>
      (!query.role || query.role === 'ALL' || user.role === query.role) &&
      (!query.status || (query.status === 'ACTIVE' ? user.isActive : !user.isActive)),
    );
  }

  async getRestaurantTables(id: string) {
    await this.ensureRestaurant(id);
    return this.prisma.table.findMany({
      where: { restaurantId: id },
      include: {
        hall: { select: { id: true, name: true } },
        qrCodes: { where: { isActive: true }, take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { orders: true } },
        orders: { take: 1, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, createdAt: true } },
      },
      orderBy: { number: 'asc' },
    });
  }

  async getRestaurantOrders(id: string, query: { period?: string; status?: string }) {
    await this.ensureRestaurant(id);
    const gte = periodDate(query.period);
    const status = query.status && Object.values(OrderStatus).includes(query.status as OrderStatus)
      ? query.status as OrderStatus
      : undefined;
    return this.prisma.order.findMany({
      where: { restaurantId: id, ...(gte ? { createdAt: { gte } } : {}), ...(status ? { status } : {}) },
      include: {
        table: { select: { id: true, number: true } },
        waiter: { select: { id: true, name: true } },
        payments: { select: { status: true, amount: true, method: true } },
        statusHistory: { take: 1, orderBy: { createdAt: 'desc' }, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getRestaurantPayments(id: string, query: { period?: string }) {
    await this.ensureRestaurant(id);
    const gte = periodDate(query.period);
    const [items, total, today, last14, unpaidOrders, paidOrders] = await Promise.all([
      this.prisma.payment.findMany({ where: { order: { restaurantId: id }, ...(gte ? { createdAt: { gte } } : {}) }, include: { order: { select: { id: true, table: { select: { number: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.payment.aggregate({ where: { order: { restaurantId: id }, status: PaymentStatus.COMPLETED }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { order: { restaurantId: id }, status: PaymentStatus.COMPLETED, createdAt: { gte: startOfToday() } }, _sum: { amount: true } }),
      this.prisma.payment.aggregate({ where: { order: { restaurantId: id }, status: PaymentStatus.COMPLETED, createdAt: { gte: fourteenDaysAgo() } }, _sum: { amount: true } }),
      this.prisma.order.count({ where: { restaurantId: id, payments: { none: { status: PaymentStatus.COMPLETED } } } }),
      this.prisma.order.count({ where: { restaurantId: id, payments: { some: { status: PaymentStatus.COMPLETED } } } }),
    ]);
    const creatorIds = [...new Set(items.map((item) => item.createdById).filter((value): value is string => Boolean(value)))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true, login: true } })
      : [];
    const creatorsById = new Map(creators.map((creator) => [creator.id, creator]));
    return {
      items: items.map((item) => ({ ...item, createdBy: item.createdById ? creatorsById.get(item.createdById) ?? null : null })),
      stats: { total: Number(total._sum.amount ?? 0), today: Number(today._sum.amount ?? 0), last14Days: Number(last14._sum.amount ?? 0), unpaidOrders, paidOrders },
    };
  }

  async getRestaurantFeedback(id: string, query: { period?: string; status?: string }) {
    await this.ensureRestaurant(id);
    const gte = periodDate(query.period);
    const ratingWhere = query.status === '5' ? { rating: 5 } : query.status === '4' ? { rating: 4 } : query.status === 'LOW' ? { rating: { lte: 3 } } : {};
    return this.prisma.feedback.findMany({
      where: { restaurantId: id, ...(gte ? { createdAt: { gte } } : {}), ...ratingWhere },
      include: { order: { select: { id: true, table: { select: { number: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getLoginHistory(id: string, query: { period?: string; role?: string; status?: string; userId?: string }) {
    await this.ensureRestaurant(id);
    await this.prisma.userSession.updateMany({
      where: { restaurantId: id, isActive: true, expiresAt: { lte: new Date() } },
      data: { isActive: false, endReason: 'expired' },
    });
    const gte = periodDate(query.period ?? '14d');
    const role = query.role && Object.values(Role).includes(query.role as Role) ? query.role as Role : undefined;
    const sessions = await this.prisma.userSession.findMany({
      where: {
        restaurantId: id,
        ...(gte ? { createdAt: { gte } } : {}),
        ...(role ? { role } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.status === 'active' ? { isActive: true, expiresAt: { gt: new Date() } } : {}),
      },
      include: { user: { select: { id: true, name: true, login: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return sessions.map((session) => ({
      ...session,
      status: session.isActive && session.expiresAt > new Date()
        ? 'active'
        : session.endReason === 'logout'
          ? 'logged_out'
          : session.endReason === 'expired' || session.expiresAt <= new Date()
            ? 'expired'
            : 'revoked',
    }));
  }

  async getActivityLogs(id: string, query: { period?: string; userId?: string; action?: string }) {
    await this.ensureRestaurant(id);
    const gte = periodDate(query.period ?? '14d');
    return this.prisma.auditLog.findMany({
      where: { restaurantId: id, ...(gte ? { createdAt: { gte } } : {}), ...(query.userId ? { userId: query.userId } : {}), ...(query.action ? { action: query.action } : {}) },
      include: { user: { select: { id: true, name: true, login: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async getSubscription(id: string) {
    const restaurant = await this.ensureRestaurant(id);
    const subscriptions = await this.prisma.subscription.findMany({ where: { restaurantId: id }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
    const current = subscriptions.find((subscription) => ['ACTIVE', 'TRIAL'].includes(subscription.status)) ?? subscriptions[0] ?? null;
    return {
      restaurantStatus: restaurant.status,
      adminLimit: restaurant.adminLimit,
      current,
      history: subscriptions,
      daysRemaining: current ? Math.max(0, Math.ceil((current.endsAt.getTime() - Date.now()) / 86400000)) : 0,
    };
  }

  async checkAvailability(values: { slug?: string; login?: string; email?: string }) {
    const [restaurant, loginUser, emailUser] = await Promise.all([
      values.slug
        ? this.prisma.restaurant.findUnique({ where: { slug: values.slug.toLowerCase() }, select: { id: true } })
        : null,
      values.login
        ? this.prisma.user.findUnique({ where: { login: values.login.toLowerCase() }, select: { id: true } })
        : null,
      values.email
        ? this.prisma.user.findUnique({ where: { email: values.email.toLowerCase() }, select: { id: true } })
        : null,
    ]);
    return {
      slugAvailable: !restaurant,
      loginAvailable: !loginUser,
      emailAvailable: !emailUser,
    };
  }

  async suggestCredentials(restaurantName: string) {
    const baseSlug = slugify(restaurantName);
    const base = adminBase(restaurantName);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = randomInt(1000, 10000);
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${suffix}`;
      const login = `${base}_admin_${suffix}`.slice(0, 32);
      const emailLocal = `${base.replace(/_/g, '.')}.admin.${suffix}`.slice(0, 52);
      const email = `${emailLocal}@menuflow.local`;
      const availability = await this.checkAvailability({ slug, login, email });
      if (availability.slugAvailable && availability.loginAvailable && availability.emailAvailable) {
        return {
          slug,
          adminName: `Администратор ${restaurantName.trim()}`,
          login,
          email,
          password: generateReadablePassword(base),
        };
      }
    }
    throw new ConflictException('Не удалось подобрать уникальные данные. Повторите попытку.');
  }

  async create(data: CreateRestaurantDto, superAdminId: string) {
    const slug = data.slug.trim().toLowerCase();
    const login = data.admin.login.trim().toLowerCase();
    const email = data.admin.email.trim().toLowerCase();
    const subscriptionEndsAt = new Date(data.subscriptionEndsAt);
    if (data.status !== RestaurantStatus.EXPIRED && subscriptionEndsAt <= new Date()) {
      throw new BadRequestException('Дата окончания подписки должна быть в будущем.');
    }

    const passwordHash = await bcrypt.hash(data.admin.password, 12);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [slugExists, loginExists, emailExists, plan] = await Promise.all([
          tx.restaurant.findUnique({ where: { slug }, select: { id: true } }),
          tx.user.findUnique({ where: { login }, select: { id: true } }),
          tx.user.findUnique({ where: { email }, select: { id: true } }),
          tx.plan.findUnique({ where: { id: data.tariffId }, select: { id: true, name: true } }),
        ]);
        if (slugExists) throw new ConflictException('Slug ресторана уже занят.');
        if (loginExists) throw new ConflictException('Логин уже занят.');
        if (emailExists) throw new ConflictException('Email уже занят.');
        if (!plan) throw new NotFoundException('Тариф не найден.');

        const restaurant = await tx.restaurant.create({
          data: {
            name: data.name.trim(),
            phone: data.phone?.trim() || null,
            address: data.address.trim(),
            city: data.city?.trim() || null,
            slug,
            status: data.status,
            tariffId: data.tariffId,
            subscriptionEndsAt,
            currency: data.currency,
            language: data.language,
            adminLimit: data.adminLimit,
            adminSessionPolicy: data.adminSessionPolicy,
          },
        });

        const subscriptionStatus = data.status === RestaurantStatus.TRIAL
          ? SubscriptionStatus.TRIAL
          : data.status === RestaurantStatus.EXPIRED
            ? SubscriptionStatus.EXPIRED
            : SubscriptionStatus.ACTIVE;
        const subscription = await tx.subscription.create({
          data: {
            restaurantId: restaurant.id,
            planId: data.tariffId,
            startsAt: new Date(),
            endsAt: subscriptionEndsAt,
            status: subscriptionStatus,
          },
        });

        const admin = await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            role: Role.ADMIN,
            name: data.admin.name.trim(),
            phone: data.admin.phone?.trim() || null,
            login,
            email,
            passwordHash,
          },
          select: { id: true, name: true, phone: true, login: true, email: true, role: true },
        });

        await tx.auditLog.createMany({
          data: [
            { userId: superAdminId, restaurantId: restaurant.id, action: 'restaurant_created', entity: 'Restaurant', entityId: restaurant.id },
            { userId: superAdminId, restaurantId: restaurant.id, action: 'restaurant_admin_created', entity: 'User', entityId: admin.id },
            { userId: superAdminId, restaurantId: restaurant.id, action: 'tariff_assigned', entity: 'Subscription', entityId: subscription.id, diff: { planId: plan.id, planName: plan.name, endsAt: subscriptionEndsAt.toISOString() } },
          ],
        });

        return {
          restaurant: { ...restaurant, tariff: plan },
          admin,
          credentials: {
            name: admin.name,
            login: admin.login,
            email: admin.email,
            password: data.admin.password,
          },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        if (target.includes('slug')) throw new ConflictException('Slug ресторана уже занят.');
        if (target.includes('email')) throw new ConflictException('Email уже занят.');
        throw new ConflictException('Логин уже занят.');
      }
      throw error;
    }
  }

  async update(id: string, data: Partial<{
    name: string;
    phone: string;
    address: string;
    city: string;
    logoUrl: string;
    currency: string;
    language: string;
    isOpen: boolean;
    workingHours: object;
    status: RestaurantStatus;
    tariffId: string;
    subscriptionEndsAt: Date;
    adminLimit: number;
    adminSessionPolicy: AdminSessionPolicy;
    allowOrders: boolean;
    allowWaiterCalls: boolean;
    allowBillRequests: boolean;
  }>) {
    await this.findOne(id);
    return this.prisma.restaurant.update({ where: { id }, data });
  }

  async getProfile(restaurantId: string) {
    return this.findOne(restaurantId);
  }

  async updateProfile(restaurantId: string, data: Parameters<typeof this.update>[1]) {
    return this.update(restaurantId, data);
  }

  async updateSettings(
    id: string,
    data: Parameters<typeof this.update>[1],
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.ensureRestaurant(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.restaurant.update({ where: { id }, data });
        await tx.auditLog.create({
          data: {
            userId,
            restaurantId: id,
            action: 'restaurant_settings_updated',
            entity: 'Restaurant',
            entityId: id,
            diff: data as Prisma.InputJsonValue,
            ipAddress,
            userAgent,
          },
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Slug ресторана уже занят.');
      }
      throw error;
    }
  }

  async setStatus(id: string, status: RestaurantStatus, userId: string) {
    await this.ensureRestaurant(id);
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.update({ where: { id }, data: { status } });
      if (status === RestaurantStatus.BLOCKED || status === RestaurantStatus.EXPIRED) {
        await tx.userSession.updateMany({
          where: { restaurantId: id, isActive: true },
          data: { isActive: false, revokedAt: new Date(), endReason: 'revoked_by_super_admin' },
        });
      }
      await tx.auditLog.create({
        data: {
          userId,
          restaurantId: id,
          action: status === RestaurantStatus.ACTIVE ? 'restaurant_activated' : 'restaurant_blocked',
          entity: 'Restaurant',
          entityId: id,
          diff: { status },
        },
      });
      return restaurant;
    });
  }

  async toggleTable(id: string, tableId: string, isActive: boolean, userId: string) {
    const table = await this.prisma.table.findFirst({ where: { id: tableId, restaurantId: id } });
    if (!table) throw new NotFoundException('Столик не найден.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.table.update({ where: { id: tableId }, data: { isActive } });
      await tx.auditLog.create({
        data: { userId, restaurantId: id, action: isActive ? 'table_activated' : 'table_deactivated', entity: 'Table', entityId: tableId },
      });
      return updated;
    });
  }

  private async ensureRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Ресторан не найден');
    return restaurant;
  }
}
