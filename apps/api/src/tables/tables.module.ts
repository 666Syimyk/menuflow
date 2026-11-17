import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { WaiterTablesController } from './waiter-tables.controller';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [GatewayModule],
  controllers: [TablesController, WaiterTablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
