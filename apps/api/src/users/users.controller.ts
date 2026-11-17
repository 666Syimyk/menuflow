import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateUserBody implements CreateUserDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() login: string;
  @ApiProperty() @IsString() @MinLength(6) password: string;
  @ApiProperty({ enum: Role }) @IsEnum(Role) role: Role;
  restaurantId: string;
}

class UpdateUserBody implements UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

class ChangePasswordBody {
  @ApiProperty() @IsString() @MinLength(6) newPassword: string;
}

@ApiTags('staff')
@ApiBearerAuth()
@Controller('admin/staff')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Список сотрудников ресторана' })
  findAll(@CurrentUser('restaurantId') restaurantId: string) {
    return this.usersService.findAll(restaurantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.usersService.findOne(id, restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Создать сотрудника' })
  create(
    @Body() dto: CreateUserBody,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.usersService.create({ ...dto, restaurantId });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserBody,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.usersService.update(id, restaurantId, dto);
  }

  @Patch(':id/password')
  changePassword(
    @Param('id') id: string,
    @Body() body: ChangePasswordBody,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.usersService.changePassword(id, restaurantId, body.newPassword);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.usersService.deactivate(id, restaurantId);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.usersService.activate(id, restaurantId);
  }
}
