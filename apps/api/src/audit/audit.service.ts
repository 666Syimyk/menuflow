import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface LogParams {
  userId?: string;
  restaurantId?: string;
  action: string;
  entity: string;
  entityId?: string;
  diff?: object;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        restaurantId: params.restaurantId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        diff: params.diff as object,
        ipAddress: params.ipAddress,
      },
    });
  }
}
