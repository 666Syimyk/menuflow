import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CashierPaymentsController } from './cashier-payments.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [GatewayModule, AuditModule],
  controllers: [PaymentsController, CashierPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
