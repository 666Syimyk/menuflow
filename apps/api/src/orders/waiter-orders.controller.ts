import { BadRequestException, Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

class ChangeStatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
  @IsOptional() @IsString() reason?: string;
}

@ApiTags('waiter/orders')
@ApiBearerAuth()
@Controller('waiter/orders')
@Roles(Role.WAITER)
export class WaiterOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  getMyOrders(
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') waiterId: string,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.getOrders(restaurantId, {
      visibleToWaiterId: waiterId,
      status,
    });
  }

  @Get(':id')
  getOrder(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') waiterId: string,
  ) {
    return this.ordersService.getOrderForWaiter(id, restaurantId, waiterId);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    // Официант может: принять → ACCEPTED, доставить → DELIVERING → SERVED
    const allowed: OrderStatus[] = [OrderStatus.ACCEPTED, OrderStatus.DELIVERING, OrderStatus.SERVED, OrderStatus.CANCEL_REQUESTED];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException('Action is not allowed for waiter');
    }
    return this.ordersService.changeStatusAsWaiter(
      id,
      restaurantId,
      userId,
      dto.status,
      dto.reason,
    );
  }
}
