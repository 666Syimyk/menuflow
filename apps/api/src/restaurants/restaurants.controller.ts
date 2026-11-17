import { Controller, Get, Post, Patch, Body, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminSessionPolicy, Role, RestaurantStatus } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsInt,
  IsISO8601,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

class CreateRestaurantAdminDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9_]{6,32}$/) login: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty()
  @IsString()
  @MinLength(10)
  @Matches(/[A-Z]/, { message: 'Пароль должен содержать заглавную букву' })
  @Matches(/[a-z]/, { message: 'Пароль должен содержать строчную букву' })
  @Matches(/\d/, { message: 'Пароль должен содержать цифру' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Пароль должен содержать спецсимвол' })
  password: string;
}

export class CreateRestaurantDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty() @IsString() @MinLength(3) address: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiProperty() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug: string;
  @ApiProperty({ enum: RestaurantStatus }) @IsEnum(RestaurantStatus) status: RestaurantStatus;
  @ApiProperty() @IsString() tariffId: string;
  @ApiProperty() @IsISO8601() subscriptionEndsAt: string;
  @ApiPropertyOptional({ default: 'KGS' }) @IsString() @Matches(/^[A-Z]{3}$/) currency = 'KGS';
  @ApiPropertyOptional({ default: 'ru' }) @IsString() @Matches(/^[a-z]{2}$/) language = 'ru';
  @ApiProperty({ default: 1 }) @IsInt() @Min(1) @Max(50) adminLimit = 1;
  @ApiProperty({ enum: AdminSessionPolicy, default: AdminSessionPolicy.deny_second_login })
  @IsEnum(AdminSessionPolicy)
  adminSessionPolicy = AdminSessionPolicy.deny_second_login;
  @ApiProperty({ type: CreateRestaurantAdminDto })
  @ValidateNested()
  @Type(() => CreateRestaurantAdminDto)
  admin: CreateRestaurantAdminDto;
}

class SuggestCredentialsDto {
  @ApiProperty() @IsString() @MinLength(2) restaurantName: string;
}

class AvailabilityQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() login?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
}

class DetailQuery {
  @IsOptional() @IsString() period?: 'today' | '14d' | 'all';
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() action?: string;
}

class UpdateRestaurantSettingsDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @Matches(/^[a-z]{2}$/) language?: string;
  @IsOptional() @IsEnum(RestaurantStatus) status?: RestaurantStatus;
  @IsOptional() @IsInt() @Min(1) @Max(50) adminLimit?: number;
  @IsOptional() @IsEnum(AdminSessionPolicy) adminSessionPolicy?: AdminSessionPolicy;
  @IsOptional() @IsBoolean() allowOrders?: boolean;
  @IsOptional() @IsBoolean() allowWaiterCalls?: boolean;
  @IsOptional() @IsBoolean() allowBillRequests?: boolean;
}

class ToggleTableDto {
  @IsBoolean() isActive: boolean;
}

class ListQuery {
  @ApiPropertyOptional({ enum: RestaurantStatus }) @IsOptional() @IsEnum(RestaurantStatus) status?: RestaurantStatus;
  @ApiPropertyOptional() @IsOptional() skip?: number;
  @ApiPropertyOptional() @IsOptional() take?: number;
}

@ApiTags('super/restaurants')
@ApiBearerAuth()
@Controller('super/restaurants')
@Roles(Role.SUPER_ADMIN)
export class RestaurantsController {
  constructor(private readonly service: RestaurantsService) {}

  @Get()
  @ApiOperation({ summary: 'Список всех ресторанов' })
  findAll(@Query() query: ListQuery) {
    return this.service.findAll(query);
  }

  @Get('availability')
  checkAvailability(@Query() query: AvailabilityQuery) {
    return this.service.checkAvailability(query);
  }

  @Post('suggest-credentials')
  suggestCredentials(@Body() dto: SuggestCredentialsDto) {
    return this.service.suggestCredentials(dto.restaurantName);
  }

  @Get(':id/summary')
  getSummary(@Param('id') id: string) { return this.service.getSummary(id); }

  @Get(':id/admins')
  getAdmins(@Param('id') id: string) { return this.service.getRestaurantUsers(id, true); }

  @Get(':id/staff')
  getStaff(@Param('id') id: string, @Query() query: DetailQuery) {
    return this.service.getRestaurantStaff(id, query);
  }

  @Get(':id/tables')
  getTables(@Param('id') id: string) { return this.service.getRestaurantTables(id); }

  @Get(':id/orders')
  getOrders(@Param('id') id: string, @Query() query: DetailQuery) {
    return this.service.getRestaurantOrders(id, query);
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: string, @Query() query: DetailQuery) {
    return this.service.getRestaurantPayments(id, query);
  }

  @Get(':id/feedback')
  getFeedback(@Param('id') id: string, @Query() query: DetailQuery) {
    return this.service.getRestaurantFeedback(id, query);
  }

  @Get(':id/login-history')
  getLoginHistory(@Param('id') id: string, @Query() query: DetailQuery) {
    return this.service.getLoginHistory(id, query);
  }

  @Get(':id/activity-logs')
  getActivityLogs(@Param('id') id: string, @Query() query: DetailQuery) {
    return this.service.getActivityLogs(id, query);
  }

  @Get(':id/subscription')
  getSubscription(@Param('id') id: string) { return this.service.getSubscription(id); }

  @Patch(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantSettingsDto,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ) {
    return this.service.updateSettings(id, dto, userId, request.ip, request.get('user-agent'));
  }

  @Patch(':id/tables/:tableId')
  toggleTable(
    @Param('id') id: string,
    @Param('tableId') tableId: string,
    @Body() dto: ToggleTableDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.toggleTable(id, tableId, dto.isActive, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.getDetails(id);
  }

  @Post()
  @ApiOperation({ summary: 'Создать ресторан' })
  create(@Body() dto: CreateRestaurantDto, @CurrentUser('id') superAdminId: string) {
    return this.service.create(dto, superAdminId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateRestaurantDto> & { status?: RestaurantStatus }) {
    const { admin: _admin, subscriptionEndsAt, ...data } = dto;
    return this.service.update(id, {
      ...data,
      subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt) : undefined,
    });
  }

  @Patch(':id/block')
  block(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.setStatus(id, RestaurantStatus.BLOCKED, userId);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.setStatus(id, RestaurantStatus.ACTIVE, userId);
  }

  @Post(':id/block')
  blockPost(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.setStatus(id, RestaurantStatus.BLOCKED, userId);
  }

  @Post(':id/activate')
  activatePost(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.setStatus(id, RestaurantStatus.ACTIVE, userId);
  }
}
