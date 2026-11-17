import { Module } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsController } from './restaurants.controller';
import { AdminRestaurantController } from './admin-restaurant.controller';

@Module({
  controllers: [RestaurantsController, AdminRestaurantController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
