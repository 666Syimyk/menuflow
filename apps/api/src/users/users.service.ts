import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export interface CreateUserDto {
  restaurantId: string;
  role: Role;
  name: string;
  login: string;
  password: string;
}

export interface UpdateUserDto {
  name?: string;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        login: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, restaurantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, restaurantId },
      select: {
        id: true,
        name: true,
        login: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Сотрудник не найден');
    return user;
  }

  async create(dto: CreateUserDto) {
    const allowedRoles: Role[] = [Role.WAITER, Role.COOK, Role.CASHIER];
    if (!allowedRoles.includes(dto.role)) {
      throw new BadRequestException(
        'ADMIN can create only WAITER, COOK, or CASHIER accounts',
      );
    }
    if (!dto.restaurantId) {
      throw new BadRequestException('Restaurant is required');
    }

    const exists = await this.prisma.user.findUnique({ where: { login: dto.login } });
    if (exists) throw new ConflictException('Логин уже занят');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        restaurantId: dto.restaurantId,
        role: dto.role,
        name: dto.name,
        login: dto.login,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        login: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, restaurantId: string, dto: UpdateUserDto) {
    await this.findOne(id, restaurantId);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, name: true, login: true, role: true, isActive: true },
    });
  }

  async changePassword(id: string, restaurantId: string, newPassword: string) {
    await this.findOne(id, restaurantId);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.userSession.updateMany({
        where: { userId: id, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: id } }),
    ]);
    return { success: true };
  }

  async deactivate(id: string, restaurantId: string) {
    return this.update(id, restaurantId, { isActive: false });
  }

  async activate(id: string, restaurantId: string) {
    return this.update(id, restaurantId, { isActive: true });
  }
}
