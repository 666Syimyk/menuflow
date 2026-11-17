import { Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FeedbackService } from './feedback.service';

@ApiTags('admin/feedback')
@ApiBearerAuth()
@Controller('admin/feedback')
@Roles(Role.ADMIN)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get()
  list(@CurrentUser('restaurantId') restaurantId: string) {
    return this.feedbackService.list(restaurantId);
  }

  @Patch(':id/reviewed')
  markReviewed(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.feedbackService.markReviewed(id, restaurantId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
  ) {
    return this.feedbackService.remove(id, restaurantId);
  }
}
