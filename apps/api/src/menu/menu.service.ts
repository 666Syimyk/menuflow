import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuFlowGateway, WsEvent } from '../gateway/menuflow.gateway';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MenuFlowGateway,
    private readonly storage: StorageService,
  ) {}

  // ─── Categories ──────────────────────────────────────────────────────────

  async getCategories(restaurantId: string, includeHidden = false) {
    return this.prisma.menuCategory.findMany({
      where: {
        restaurantId,
        ...(includeHidden ? {} : { isVisible: true }),
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: { select: { dishes: true } },
      },
    });
  }

  async createCategory(restaurantId: string, data: {
    name: string;
    nameKy?: string;
    nameEn?: string;
    sortOrder?: number;
  }) {
    return this.prisma.menuCategory.create({
      data: { restaurantId, ...data },
    });
  }

  async updateCategory(id: string, restaurantId: string, data: {
    name?: string;
    nameKy?: string;
    nameEn?: string;
    sortOrder?: number;
    isVisible?: boolean;
  }) {
    await this.ensureCategoryBelongsTo(id, restaurantId);
    return this.prisma.menuCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string, restaurantId: string) {
    await this.ensureCategoryBelongsTo(id, restaurantId);
    const dishCount = await this.prisma.dish.count({
      where: { categoryId: id, isActive: true },
    });
    if (dishCount > 0) {
      throw new BadRequestException('Нельзя удалить категорию с активными блюдами');
    }
    await this.prisma.menuCategory.delete({ where: { id } });
    return { success: true };
  }

  async reorderCategories(restaurantId: string, order: { id: string; sortOrder: number }[]) {
    await Promise.all(
      order.map(({ id, sortOrder }) =>
        this.prisma.menuCategory.updateMany({
          where: { id, restaurantId },
          data: { sortOrder },
        }),
      ),
    );
    return { success: true };
  }

  // ─── Dishes ──────────────────────────────────────────────────────────────

  async getDishes(restaurantId: string, params: {
    categoryId?: string;
    includeHidden?: boolean;
    includeStoplist?: boolean;
  } = {}) {
    const { categoryId, includeHidden = false, includeStoplist = true } = params;

    return this.prisma.dish.findMany({
      where: {
        restaurantId,
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(includeHidden ? {} : { isVisible: true }),
        ...(includeStoplist ? {} : { inStoplist: false }),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        variants: { where: { isActive: true } },
        addons: { where: { isActive: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async getDishById(id: string, restaurantId: string) {
    const dish = await this.prisma.dish.findFirst({
      where: { id, restaurantId, isActive: true },
      include: {
        variants: { where: { isActive: true } },
        addons: { where: { isActive: true } },
        category: { select: { id: true, name: true } },
      },
    });
    if (!dish) throw new NotFoundException('Блюдо не найдено');
    return dish;
  }

  async createDish(restaurantId: string, data: {
    categoryId: string;
    name: string;
    nameKy?: string;
    nameEn?: string;
    description?: string;
    price: number;
    weight?: number;
    cookTimeMin?: number;
  }) {
    await this.ensureCategoryBelongsTo(data.categoryId, restaurantId);
    return this.prisma.dish.create({ data: { restaurantId, ...data } });
  }

  async updateDish(id: string, restaurantId: string, data: Partial<{
    name: string;
    description: string;
    price: number;
    weight: number;
    cookTimeMin: number;
    categoryId: string;
    isVisible: boolean;
    sortOrder: number;
    photoUrl: string;
  }>) {
    await this.getDishById(id, restaurantId);
    if (data.categoryId) {
      await this.ensureCategoryBelongsTo(data.categoryId, restaurantId);
    }
    const dish = await this.prisma.dish.update({ where: { id }, data });
    this.gateway.emitToAllRestaurantStaff(restaurantId, WsEvent.MENU_UPDATED, { dishId: id });
    return dish;
  }

  async uploadDishPhoto(id: string, restaurantId: string, buffer: Buffer) {
    await this.getDishById(id, restaurantId);
    const url = await this.storage.uploadImage(buffer, `restaurants/${restaurantId}/dishes`, {
      width: 800,
      quality: 85,
    });
    return this.updateDish(id, restaurantId, { photoUrl: url });
  }

  async deleteDish(id: string, restaurantId: string) {
    await this.getDishById(id, restaurantId);
    await this.prisma.dish.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  async toggleStoplist(id: string, restaurantId: string, data: {
    inStoplist: boolean;
    reason?: string;
    until?: Date;
  }) {
    await this.getDishById(id, restaurantId);
    const dish = await this.prisma.dish.update({
      where: { id },
      data: {
        inStoplist: data.inStoplist,
        stoplistReason: data.reason ?? null,
        stoplistUntil: data.until ?? null,
      },
    });

    this.gateway.emitToAllRestaurantStaff(restaurantId, WsEvent.DISH_STOPLIST_CHANGED, {
      dishId: id,
      inStoplist: data.inStoplist,
    });

    return dish;
  }

  // ─── Variants & Addons ───────────────────────────────────────────────────

  async addVariant(dishId: string, restaurantId: string, data: { name: string; priceDelta: number }) {
    await this.getDishById(dishId, restaurantId);
    return this.prisma.dishVariant.create({ data: { dishId, ...data } });
  }

  async updateVariant(
    id: string,
    restaurantId: string,
    data: { name?: string; priceDelta?: number; isActive?: boolean },
  ) {
    const variant = await this.prisma.dishVariant.findFirst({
      where: { id, dish: { restaurantId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.dishVariant.update({ where: { id }, data });
  }

  async addAddon(dishId: string, restaurantId: string, data: { name: string; price: number }) {
    await this.getDishById(dishId, restaurantId);
    return this.prisma.dishAddon.create({ data: { dishId, ...data } });
  }

  async updateAddon(
    id: string,
    restaurantId: string,
    data: { name?: string; price?: number; isActive?: boolean },
  ) {
    const addon = await this.prisma.dishAddon.findFirst({
      where: { id, dish: { restaurantId } },
    });
    if (!addon) throw new NotFoundException('Addon not found');
    return this.prisma.dishAddon.update({ where: { id }, data });
  }

  // ─── Public menu (for QR) ─────────────────────────────────────────────────

  async getPublicMenu(restaurantId: string) {
    const [restaurant, categories] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          name: true,
          logoUrl: true,
          currency: true,
          isOpen: true,
          workingHours: true,
        },
      }),
      this.prisma.menuCategory.findMany({
        where: { restaurantId, isVisible: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          dishes: {
            where: { restaurantId, isActive: true, isVisible: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              variants: { where: { isActive: true } },
              addons: { where: { isActive: true } },
            },
          },
        },
      }),
    ]);

    return { restaurant, categories: categories.filter((c) => c.dishes.length > 0) };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async ensureCategoryBelongsTo(categoryId: string, restaurantId: string) {
    const cat = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
    });
    if (!cat) throw new NotFoundException('Категория не найдена');
    return cat;
  }
}
