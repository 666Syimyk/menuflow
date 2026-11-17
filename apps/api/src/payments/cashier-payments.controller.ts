import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, PaymentMethod } from '@prisma/client';
import { IsEnum, IsNumber, IsString, Min } from 'class-validator';

class CreatePaymentDto {
  @IsString() orderId: string;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsNumber() @Min(0.01) amount: number;
}

@ApiTags('cashier/payments')
@ApiBearerAuth()
@Controller('cashier/payments')
@Roles(Role.CASHIER)
export class CashierPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('unpaid')
  getUnpaid(@CurrentUser('restaurantId') restaurantId: string) {
    return this.paymentsService.getUnpaidOrders(restaurantId);
  }

  @Post()
  createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('restaurantId') restaurantId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.createPayment({ ...dto, restaurantId, createdById: userId });
  }

  @Get('daily')
  getDailyReport(@CurrentUser('restaurantId') restaurantId: string, @Query('date') date?: string) {
    return this.paymentsService.getDailyReport(restaurantId, date ? new Date(date) : new Date());
  }
}
