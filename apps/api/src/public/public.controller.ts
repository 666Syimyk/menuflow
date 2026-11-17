import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WaiterCallType } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import { TablesService } from '../tables/tables.service';

class PublicOrderItemDto {
  @ApiProperty()
  @IsString()
  dishId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  qty: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addonIds?: string[];
}

class CreatePublicOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientComment?: string;

  @ApiProperty({ type: [PublicOrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PublicOrderItemDto)
  items: PublicOrderItemDto[];
}

class RequestBillDto {
  @IsString()
  publicToken: string;
}

@ApiTags('public')
@Controller('public')
@Public()
export class PublicController {
  constructor(
    private readonly menuService: MenuService,
    private readonly ordersService: OrdersService,
    private readonly tablesService: TablesService,
  ) {}

  @Get('menu/:qrToken')
  @ApiOperation({ summary: 'Get public menu by QR token' })
  async getMenu(@Param('qrToken') qrToken: string) {
    const qr = await this.tablesService.getQrByToken(qrToken);
    const menu = await this.menuService.getPublicMenu(qr.table.restaurant.id);
    return {
      tableId: qr.tableId,
      tableNumber: qr.table.number,
      ...menu,
      restaurant: qr.table.restaurant,
    };
  }

  @Post('orders/:qrToken')
  @ApiOperation({ summary: 'Create guest order' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async createOrder(
    @Param('qrToken') qrToken: string,
    @Body() dto: CreatePublicOrderDto,
  ) {
    const qr = await this.tablesService.getQrByToken(qrToken);
    if (!qr.table.restaurant.allowOrders) {
      throw new ForbiddenException('Ресторан временно не принимает заказы.');
    }
    return this.ordersService.createOrder({
      restaurantId: qr.table.restaurant.id,
      tableId: qr.tableId,
      waiterId: qr.table.waiterId ?? undefined,
      clientComment: dto.clientComment,
      items: dto.items,
    });
  }

  @Get('orders/status/:publicToken')
  @ApiOperation({ summary: 'Get guest order status by secure token' })
  getOrderStatus(@Param('publicToken') publicToken: string) {
    return this.ordersService.getPublicOrderStatus(publicToken);
  }

  @Post('calls/:qrToken/waiter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Call waiter' })
  async callWaiter(@Param('qrToken') qrToken: string) {
    const qr = await this.tablesService.getQrByToken(qrToken);
    if (!qr.table.restaurant.allowWaiterCalls) {
      throw new ForbiddenException('Вызов официанта отключён рестораном.');
    }
    return this.tablesService.createCall(qr.tableId, WaiterCallType.CALL);
  }

  @Post('calls/:qrToken/bill')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request bill for active order' })
  async requestBill(
    @Param('qrToken') qrToken: string,
    @Body() dto: RequestBillDto,
  ) {
    const qr = await this.tablesService.getQrByToken(qrToken);
    if (!qr.table.restaurant.allowBillRequests) {
      throw new ForbiddenException('Просьба счёта отключена рестораном.');
    }
    const order = await this.ordersService.requestBill(
      dto.publicToken,
      qr.tableId,
    );
    return this.tablesService.createCall(
      qr.tableId,
      WaiterCallType.BILL,
      order.id,
    );
  }
}
