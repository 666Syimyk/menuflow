import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { addDays } from '../common/utils/date.utils';

type AuthUser = {
  id: string;
  login: string;
  role: Role;
  restaurantId: string | null;
  isActive: boolean;
  name: string;
  restaurant?: {
    status: string;
    adminSessionPolicy: 'deny_second_login' | 'kick_previous_session';
    subscriptions: { id: string }[];
  } | null;
};

type SessionMeta = { ipAddress?: string; userAgent?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async login(login: string, password: string, meta: SessionMeta = {}) {
    const user = await this.prisma.user.findUnique({
      where: { login: login.trim().toLowerCase() },
      select: {
        id: true,
        login: true,
        passwordHash: true,
        role: true,
        restaurantId: true,
        isActive: true,
        name: true,
        restaurant: {
          select: {
            status: true,
            adminSessionPolicy: true,
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

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный логин или пароль.');
    }
    if (!user.isActive) throw new UnauthorizedException('Учётная запись отключена.');

    this.assertRestaurantAccess(user);
    return this.createSession(user, meta);
  }

  async refresh(refreshToken: string) {
    const parsed = this.parseRefreshToken(refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { sessionId: parsed.sessionId },
      include: {
        user: {
          select: {
            id: true,
            login: true,
            role: true,
            restaurantId: true,
            isActive: true,
            name: true,
            restaurant: {
              select: {
                status: true,
                adminSessionPolicy: true,
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
        },
      },
    });

    if (
      !session ||
      !session.isActive ||
      session.expiresAt <= new Date() ||
      !this.hashMatches(parsed.secret, session.refreshTokenHash)
    ) {
      throw new UnauthorizedException('Сессия истекла. Войдите снова.');
    }
    if (!session.user.isActive) throw new UnauthorizedException('Учётная запись отключена.');
    this.assertRestaurantAccess(session.user);

    return this.rotateSession(session.user, session.sessionId);
  }

  async logout(userId: string, refreshToken: string) {
    const sessionId = this.tryGetSessionId(refreshToken);
    if (sessionId) {
      await this.prisma.$transaction(async (tx) => {
        const session = await tx.userSession.findFirst({
          where: { userId, sessionId },
          select: { restaurantId: true, ipAddress: true, userAgent: true },
        });
        await tx.userSession.updateMany({
          where: { userId, sessionId, isActive: true },
          data: { isActive: false, logoutAt: new Date(), endReason: 'logout' },
        });
        if (session) {
          await tx.auditLog.create({
            data: {
              userId,
              restaurantId: session.restaurantId,
              action: 'user_logout',
              entity: 'UserSession',
              entityId: sessionId,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            },
          });
        }
      });
    }
    await this.prisma.refreshToken.deleteMany({ where: { userId, token: refreshToken } });
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.userSession.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, logoutAt: new Date(), endReason: 'logout' },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        login: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        restaurantId: true,
        isActive: true,
        createdAt: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            currency: true,
            language: true,
            isOpen: true,
            status: true,
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async createSession(user: AuthUser, meta: SessionMeta) {
    const sessionId = randomUUID();
    const secret = randomUUID();
    const expiresAt = addDays(new Date(), 7);
    const sessionData = {
      userId: user.id,
      restaurantId: user.restaurantId,
      role: user.role,
      sessionId,
      refreshTokenHash: this.hashSecret(secret),
      ipAddress: meta.ipAddress?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 512),
      expiresAt,
    };

    if (user.role === Role.ADMIN) {
      await this.prisma.$transaction(async (tx) => {
        await tx.userSession.updateMany({
          where: { userId: user.id, isActive: true, expiresAt: { lte: new Date() } },
          data: { isActive: false, endReason: 'expired' },
        });
        const activeWhere = {
          userId: user.id,
          isActive: true,
          expiresAt: { gt: new Date() },
        };
        const activeCount = await tx.userSession.count({ where: activeWhere });
        if (activeCount > 0 && user.restaurant?.adminSessionPolicy === 'deny_second_login') {
          throw new ConflictException(
            'Этот администратор уже вошёл в систему. Дождитесь выхода или обратитесь к супер-админу.',
          );
        }
        if (activeCount > 0) {
          await tx.userSession.updateMany({
            where: activeWhere,
            data: {
              isActive: false,
              revokedAt: new Date(),
              endReason: 'kicked_by_new_login',
            },
          });
        }
        await tx.userSession.create({ data: sessionData });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            restaurantId: user.restaurantId,
            action: 'user_login',
            entity: 'UserSession',
            entityId: sessionId,
            ipAddress: sessionData.ipAddress,
            userAgent: sessionData.userAgent,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } else {
      await this.prisma.$transaction([
        this.prisma.userSession.create({ data: sessionData }),
        this.prisma.auditLog.create({
          data: {
            userId: user.id,
            restaurantId: user.restaurantId,
            action: 'user_login',
            entity: 'UserSession',
            entityId: sessionId,
            ipAddress: sessionData.ipAddress,
            userAgent: sessionData.userAgent,
          },
        }),
      ]);
    }
    return this.tokenResponse(user, sessionId, `${sessionId}.${secret}`);
  }

  private async rotateSession(user: AuthUser, sessionId: string) {
    const secret = randomUUID();
    await this.prisma.userSession.update({
      where: { sessionId },
      data: {
        refreshTokenHash: this.hashSecret(secret),
        lastSeenAt: new Date(),
        expiresAt: addDays(new Date(), 7),
      },
    });
    return this.tokenResponse(user, sessionId, `${sessionId}.${secret}`);
  }

  private tokenResponse(user: AuthUser, sessionId: string, refreshToken: string) {
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        login: user.login,
        role: user.role,
        restaurantId: user.restaurantId,
        sessionId,
      },
      {
        secret: this.cfg.getOrThrow('JWT_SECRET'),
        expiresIn: this.cfg.get('JWT_EXPIRES_IN', '15m'),
      },
    );
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
      },
    };
  }

  private parseRefreshToken(token: string) {
    const separator = token.indexOf('.');
    if (separator < 1 || separator === token.length - 1) {
      throw new UnauthorizedException('Некорректный refresh token.');
    }
    return { sessionId: token.slice(0, separator), secret: token.slice(separator + 1) };
  }

  private tryGetSessionId(token: string) {
    const separator = token.indexOf('.');
    return separator > 0 ? token.slice(0, separator) : null;
  }

  private hashSecret(secret: string) {
    return createHash('sha256').update(secret).digest('hex');
  }

  private hashMatches(secret: string, expected: string) {
    const actualBuffer = Buffer.from(this.hashSecret(secret), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private assertRestaurantAccess(user: AuthUser) {
    if (user.role === Role.SUPER_ADMIN) return;
    if (!user.restaurantId || !user.restaurant) {
      throw new UnauthorizedException('Сотрудник не привязан к ресторану.');
    }
    if (!['ACTIVE', 'TRIAL'].includes(user.restaurant.status)) {
      throw new UnauthorizedException('Доступ ресторана отключён.');
    }
    if (user.restaurant.subscriptions.length === 0) {
      throw new UnauthorizedException('Подписка ресторана неактивна.');
    }
  }
}
