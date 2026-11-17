import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  list(restaurantId: string) {
    return this.prisma.feedback.findMany({
      where: { restaurantId },
      include: {
        order: {
          select: {
            id: true,
            table: { select: { number: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markReviewed(id: string, restaurantId: string) {
    await this.ensureOwned(id, restaurantId);
    return this.prisma.feedback.update({
      where: { id },
      data: { isReviewed: true, reviewedAt: new Date() },
    });
  }

  async remove(id: string, restaurantId: string) {
    await this.ensureOwned(id, restaurantId);
    await this.prisma.feedback.delete({ where: { id } });
    return { success: true };
  }

  private async ensureOwned(id: string, restaurantId: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, restaurantId },
      select: { id: true },
    });
    if (!feedback) throw new NotFoundException('Feedback not found');
  }
}
