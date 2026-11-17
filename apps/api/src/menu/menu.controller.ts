import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import {
  IsString, IsNumber, IsOptional, IsBoolean, IsDate, IsArray, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── DTOs ────────────────────────────────────────────────────────────────────

class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameKy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

class ReorderItemDto {
  @ApiProperty() @IsString() id: string;
  @ApiProperty() @IsNumber() sortOrder: number;
}

class ReorderDto {
  @ApiProperty({ type: [ReorderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  order: ReorderItemDto[];
}

class CreateDishDto {
  @ApiProperty() @IsString() categoryId: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameKy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsNumber() @Min(0) price: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cookTimeMin?: number;
}

class StoplistDto {
  @ApiProperty() @IsBoolean() inStoplist: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsDate() @Type(() => Date) until?: Date;
}

class VariantDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() priceDelta: number;
}

class AddonDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() @Min(0) price: number;
}

// ─── Controller ──────────────────────────────────────────────────────────────

@ApiTags('menu')
@ApiBearerAuth()
@Controller('admin/menu')
@Roles(Role.ADMIN)
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // ─── Categories ──────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Категории меню' })
  getCategories(@CurrentUser('restaurantId') restaurantId: string) {
    return this.menuService.getCategories(restaurantId, true);
  }

  @Post('categories')
  createCategory(@CurrentUser('restaurantId') restaurantId: string, @Body() dto: CreateCategoryDto) {
    return this.menuService.createCategory(restaurantId, dto);
  }

  @Patch('categories/reorder')
  reorderCategories(@CurrentUser('restaurantId') restaurantId: string, @Body() dto: ReorderDto) {
    return this.menuService.reorderCategories(restaurantId, dto.order);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: Partial<CreateCategoryDto> & { isVisible?: boolean },
  ) {
    return this.menuService.updateCategory(id, restaurantId, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  deleteCategory(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.menuService.deleteCategory(id, restaurantId);
  }

  // ─── Dishes ──────────────────────────────────────────────────────────────

  @Get('dishes')
  @ApiOperation({ summary: 'Список блюд' })
  getDishes(
    @CurrentUser('restaurantId') restaurantId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.menuService.getDishes(restaurantId, { categoryId, includeHidden: true });
  }

  @Get('dishes/:id')
  getDish(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.menuService.getDishById(id, restaurantId);
  }

  @Post('dishes')
  @ApiOperation({ summary: 'Создать блюдо' })
  createDish(@CurrentUser('restaurantId') restaurantId: string, @Body() dto: CreateDishDto) {
    return this.menuService.createDish(restaurantId, dto);
  }

  @Patch('dishes/:id')
  updateDish(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: Partial<CreateDishDto> & { isVisible?: boolean; sortOrder?: number },
  ) {
    return this.menuService.updateDish(id, restaurantId, dto);
  }

  @Post('dishes/:id/photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo'))
  uploadPhoto(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.menuService.uploadDishPhoto(id, restaurantId, file.buffer);
  }

  @Patch('dishes/:id/stoplist')
  @ApiOperation({ summary: 'Добавить/убрать из стоп-листа' })
  toggleStoplist(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: StoplistDto,
  ) {
    return this.menuService.toggleStoplist(id, restaurantId, dto);
  }

  @Delete('dishes/:id')
  @HttpCode(HttpStatus.OK)
  deleteDish(@Param('id') id: string, @CurrentUser('restaurantId') restaurantId: string) {
    return this.menuService.deleteDish(id, restaurantId);
  }

  // ─── Variants ────────────────────────────────────────────────────────────

  @Post('dishes/:id/variants')
  addVariant(
    @Param('id') dishId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: VariantDto,
  ) {
    return this.menuService.addVariant(dishId, restaurantId, dto);
  }

  @Patch('variants/:id')
  updateVariant(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: Partial<VariantDto> & { isActive?: boolean },
  ) {
    return this.menuService.updateVariant(id, restaurantId, dto);
  }

  // ─── Addons ──────────────────────────────────────────────────────────────

  @Post('dishes/:id/addons')
  addAddon(
    @Param('id') dishId: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: AddonDto,
  ) {
    return this.menuService.addAddon(dishId, restaurantId, dto);
  }

  @Patch('addons/:id')
  updateAddon(
    @Param('id') id: string,
    @CurrentUser('restaurantId') restaurantId: string,
    @Body() dto: Partial<AddonDto> & { isActive?: boolean },
  ) {
    return this.menuService.updateAddon(id, restaurantId, dto);
  }
}
