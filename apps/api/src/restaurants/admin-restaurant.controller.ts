import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isOpen?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() workingHours?: object;
}

@ApiTags('admin/restaurant')
@ApiBearerAuth()
@Controller('admin/restaurant')
@Roles(Role.ADMIN)
export class AdminRestaurantController {
  constructor(private readonly service: RestaurantsService) {}

  @Get('profile')
  getProfile(@CurrentUser('restaurantId') restaurantId: string) {
    return this.service.getProfile(restaurantId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.service.updateProfile(restaurantId, dto);
  }
}
