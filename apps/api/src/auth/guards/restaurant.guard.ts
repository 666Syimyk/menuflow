import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

@Injectable()
export class RestaurantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;
    if (user.role === Role.SUPER_ADMIN) return true;

    const restaurantId =
      request.params?.restaurantId ??
      request.body?.restaurantId ??
      request.query?.restaurantId;

    if (restaurantId && user.restaurantId !== restaurantId) {
      throw new ForbiddenException('Нет доступа к этому ресторану');
    }

    return true;
  }
}
