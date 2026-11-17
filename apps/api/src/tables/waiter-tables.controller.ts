import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TablesService } from './tables.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, TableStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

class UpdateTableStatusDto {
  @IsEnum(TableStatus) status: TableStatus;
}

@ApiTags('waiter/tables')
@ApiBearerAuth()
@Controller('waiter/tables')
@Roles(Role.WAITER)
export class WaiterTablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  getMyTables(@CurrentUser('restaurantId') restaurantId: string) {
    return this.tablesService.getTables(restaurantId, {});
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: UpdateTableStatusDto,
  ) {
    return this.tablesService.updateTableStatus(id, restaurantId, dto.status);
  }

  @Get('calls')
  getActiveCalls(@CurrentUser('restaurantId') restaurantId: string) {
    return this.tablesService.getActiveCalls(restaurantId);
  }

  @Patch('calls/:callId/close')
  closeCall(
    @Param('callId') callId: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.tablesService.closeCall(callId, restaurantId);
  }
}
