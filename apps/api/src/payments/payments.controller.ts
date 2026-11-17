import { Controller, Post, Patch, Get, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, PaymentMethod } from '@prisma/client';
import { IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CreatePaymentDto {
  @ApiProperty() @IsString() orderId: string;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
}

class CancelPaymentDto {
  @ApiProperty() @IsString() reason: string;
}

@ApiTags('admin/payments')
@ApiBearerAuth()
@Controller('admin/payments')
@Roles(Role.ADMIN)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  createPayment(@Body() dto: CreatePaymentDto, @CurrentUser('restaurantId') restaurantId: string, @CurrentUser('id') userId: string) {
    return this.paymentsService.createPayment({ ...dto, restaurantId, createdById: userId });
  }

  @Patch(':id/cancel')
  cancelPayment(@Param('id') id: string, @Body() dto: CancelPaymentDto, @CurrentUser('restaurantId') restaurantId: string, @CurrentUser('id') userId: string) {
    return this.paymentsService.cancelPayment(id, restaurantId, dto.reason, userId);
  }

  @Get('daily')
  getDailyReport(@CurrentUser('restaurantId') restaurantId: string, @Query('date') date?: string) {
    return this.paymentsService.getDailyReport(restaurantId, date ? new Date(date) : new Date());
  }
}
