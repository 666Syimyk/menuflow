import {
  Controller, Get, Post, Patch, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, TableStatus } from '@prisma/client';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateTableDto {
  @ApiProperty() @IsNumber() @Min(1) number: number;
  @ApiPropertyOptional() @IsOptional() @IsString() hallId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() waiterId?: string;
}

class CreateHallDto {
  @ApiProperty() @IsString() name: string;
}

@ApiTags('admin/tables')
@ApiBearerAuth()
@Controller('admin/tables')
@Roles(Role.ADMIN)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('halls')
  getHalls(@CurrentUser('restaurantId') restaurantId: string) {
    return this.tablesService.getHalls(restaurantId);
  }

  @Post('halls')
  createHall(@CurrentUser('restaurantId') restaurantId: string, @Body() dto: CreateHallDto) {
    return this.tablesService.createHall(restaurantId, dto.name);
  }

  @Get()
  getTables(
    @CurrentUser('restaurantId') restaurantId: string,
    @Query('hallId') hallId?: string,
    @Query('status') status?: TableStatus,
  ) {
    return this.tablesService.getTables(restaurantId, { hallId, status });
  }

  @Post()
  createTable(@CurrentUser('restaurantId') restaurantId: string, @Body() dto: CreateTableDto) {
    return this.tablesService.createTable(restaurantId, dto);
  }

  @Patch(':id')
  updateTable(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: Partial<CreateTableDto>,
  ) {
    return this.tablesService.updateTable(id, restaurantId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: { status: TableStatus },
  ) {
    return this.tablesService.updateTableStatus(id, restaurantId, dto.status);
  }

  @Post(':id/qr')
  generateQr(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.tablesService.generateQr(id, restaurantId);
  }

  @Get('calls')
  getActiveCalls(@CurrentUser('restaurantId') restaurantId: string) {
    return this.tablesService.getActiveCalls(restaurantId);
  }

  @Patch('calls/:callId/close')
  closeCall(@Param('callId') callId: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.tablesService.closeCall(callId, restaurantId);
  }
}
