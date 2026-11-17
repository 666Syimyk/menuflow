import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MenuFlowGateway } from './menuflow.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow('JWT_SECRET'),
      }),
    }),
  ],
  providers: [MenuFlowGateway],
  exports: [MenuFlowGateway],
})
export class GatewayModule {}
