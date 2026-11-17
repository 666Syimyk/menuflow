import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { WaiterOrdersController } from './waiter-orders.controller';
import { KitchenOrdersController } from './kitchen-orders.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [GatewayModule, AuditModule],
  controllers: [OrdersController, WaiterOrdersController, KitchenOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
