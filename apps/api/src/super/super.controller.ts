import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperService } from './super.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import {
  IsString, IsOptional, IsNumber, IsInt, IsBoolean, Min, IsObject, IsEmail, MinLength, Matches,
} from 'class-validator';

class CreateAdminDto {
  @IsString() restaurantId: string;
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() login: string;
  @IsEmail() email: string;
  @IsString() @MinLength(10) @Matches(/[A-Z]/) @Matches(/[a-z]/) @Matches(/\d/) @Matches(/[^A-Za-z0-9]/) password: string;
}

class CreatePlanDto {
  @IsString() name: string;
  @IsNumber() @Min(0) price: number;
  @IsInt() @Min(1) periodDays: number;
  @IsObject() limits: object;
}

class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(1) periodDays?: number;
  @IsOptional() @IsObject() limits?: object;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class AssignSubscriptionDto {
  @IsString() restaurantId: string;
  @IsString() planId: string;
  @IsInt() @Min(1) days: number;
}

class ExtendSubscriptionDto {
  @IsInt() @Min(1) days: number;
}

@ApiTags('super')
@ApiBearerAuth()
@Controller('super')
@Roles(Role.SUPER_ADMIN)
export class SuperController {
  constructor(private readonly superService: SuperService) {}

  @Get('stats')
  getPlatformStats() {
    return this.superService.getPlatformStats();
  }

  // Users
  @Get('users')
  listUsers(
    @Query('role') role?: Role,
    @Query('restaurantId') restaurantId?: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.superService.listAllUsers({ role, restaurantId, skip, take });
  }

  @Post('users/admin')
  createAdmin(@Body() dto: CreateAdminDto, @CurrentUser('id') superAdminId: string) {
    return this.superService.createAdminUser(dto, superAdminId);
  }

  @Patch('users/:id/activate')
  activateUser(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.superService.toggleUserActive(id, true, actorId);
  }

  @Patch('users/:id/deactivate')
  deactivateUser(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.superService.toggleUserActive(id, false, actorId);
  }

  @Post('users/:id/revoke-sessions')
  revokeSessions(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.superService.revokeUserSessions(id, actorId);
  }

  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.superService.resetUserPassword(id, actorId);
  }

  // Plans
  @Get('plans')
  getPlans() {
    return this.superService.getPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.superService.createPlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.superService.updatePlan(id, dto);
  }

  // Subscriptions
  @Post('subscriptions')
  assignSubscription(@Body() dto: AssignSubscriptionDto) {
    return this.superService.assignSubscription(dto);
  }

  @Get('subscriptions')
  listSubscriptions() {
    return this.superService.listSubscriptions();
  }

  @Patch('subscriptions/:id/extend')
  extendSubscription(
    @Param('id') id: string,
    @Body() dto: ExtendSubscriptionDto,
  ) {
    return this.superService.extendSubscription(id, dto.days);
  }
}
