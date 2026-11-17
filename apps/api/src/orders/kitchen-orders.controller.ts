import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, OrderStatus, OrderItemStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

class ItemStatusDto {
  @IsEnum(OrderItemStatus) status: OrderItemStatus;
}

@ApiTags('kitchen/orders')
@ApiBearerAuth()
@Controller('kitchen/orders')
@Roles(Role.COOK)
export class KitchenOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getKitchenQueue(@CurrentUser('restaurantId') restaurantId: string) {
    return this.ordersService.getOrders(restaurantId, {
      status: [OrderStatus.ACCEPTED, OrderStatus.COOKING, OrderStatus.READY],
    });
  }

  @Patch(':id/start')
  startCooking(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.changeStatus(id, restaurantId, OrderStatus.COOKING, userId);
  }

  @Patch(':id/ready')
  markReady(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.changeStatus(id, restaurantId, OrderStatus.READY, userId);
  }

  @Patch(':id/items/:itemId/status')
  updateItemStatus(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ItemStatusDto,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.updateItemStatus(orderId, restaurantId, itemId, dto.status, userId);
  }
}
