import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  login: string;
  role: string;
  restaurantId: string | null;
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sessionId) throw new UnauthorizedException('Session is missing');
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
      throw new UnauthorizedException('session_expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is missing or disabled');
    }
    if (
      user.role !== 'SUPER_ADMIN' &&
      (
        !user.restaurantId ||
        !user.restaurant ||
        !['ACTIVE', 'TRIAL'].includes(user.restaurant.status) ||
        user.restaurant.subscriptions.length === 0
      )
    ) {
      throw new UnauthorizedException('Restaurant access is disabled');
    }

    const { restaurant: _restaurant, ...safeUser } = user;
    await this.prisma.userSession.update({
      where: { sessionId: payload.sessionId },
      data: { lastSeenAt: new Date() },
    });
    return { ...safeUser, sessionId: payload.sessionId };
  }
}
