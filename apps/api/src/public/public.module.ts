import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';
import { TablesModule } from '../tables/tables.module';

@Module({
  imports: [MenuModule, OrdersModule, TablesModule],
  controllers: [PublicController],
})
export class PublicModule {}
