import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { IsString, IsOptional, IsEnum, IsArray, IsInt, Min, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class OrderItemDto {
  @ApiProperty() @IsString() dishId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiProperty() @IsInt() @Min(1) qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) addonIds?: string[];
}

class CreateOrderDto {
  @ApiProperty() @IsString() tableId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() clientComment?: string;
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

class ChangeStatusDto {
  @ApiProperty({ enum: OrderStatus }) @IsEnum(OrderStatus) status: OrderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

@ApiTags('admin/orders')
@ApiBearerAuth()
@Controller('admin/orders')
@Roles(Role.ADMIN)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Список заказов' })
  getOrders(
    @CurrentUser('restaurantId') restaurantId: string,
    @Query('status') status?: OrderStatus,
    @Query('tableId') tableId?: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.ordersService.getOrders(restaurantId, { status, tableId, skip, take });
  }

  @Get(':id')
  getOrder(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.ordersService.getOrder(id, restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать заказ вручную' })
  createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.createOrder({ ...dto, restaurantId }, userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Изменить статус заказа' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.changeStatus(id, restaurantId, dto.status, userId, dto.reason);
  }

  @Post(':id/items')
  addItem(
    @Param('id') orderId: string,
    @Body() item: OrderItemDto,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.ordersService.addItem(orderId, restaurantId, item);
  }

  @Patch(':id/items/:itemId/status')
  updateItemStatus(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: { status: string },
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.ordersService.updateItemStatus(orderId, restaurantId, itemId, dto.status as any, userId);
  }
}
