import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { ALLOWED_IMAGE_TYPES } from '../storage/storage.service';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Permissions:
 *   view                              - every role
 *   create / edit / images            - ADMIN, MANAGER
 *   delete                            - ADMIN
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser, @Query() query: QueryProductDto) {
    const products = await this.productsService.findAll(query);
    return Promise.all(products.map((p) => this.productsService.present(p, user)));
  }

  /** Categories for the product form dropdown (declared before :id so it isn't parsed as an id) */
  @Get('categories')
  findCategories() {
    return this.productsService.findCategories();
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.present(await this.productsService.findOne(id), user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@CurrentUser() user: AuthUser, @Body() createProductDto: CreateProductDto) {
    return this.productsService.present(await this.productsService.create(createProductDto), user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.present(await this.productsService.update(id, updateProductDto), user);
  }

  /** Multipart upload (field name "file") of a product image to S3. */
  @Post(':id/image')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) =>
        ALLOWED_IMAGE_TYPES.includes(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException(`Image must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false),
    }),
  )
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Attach the image as multipart field "file" (max 5 MB)');
    }
    return this.productsService.present(await this.productsService.setImage(id, file), user);
  }

  /** Pre-signed URL for direct client PUT upload to S3 */
  @Post(':id/presigned-upload-url')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async getPresignedUploadUrl(
    @Param('id') id: string,
    @Body('contentType') contentType: string,
  ) {
    if (!contentType || !ALLOWED_IMAGE_TYPES.includes(contentType)) {
      throw new BadRequestException(
        `Invalid contentType. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      );
    }
    return this.productsService.getPresignedUploadUrl(id, contentType);
  }

  /** Confirm that an image was uploaded directly to S3 via pre-signed URL */
  @Post(':id/confirm-image')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async confirmImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('key') key: string,
  ) {
    if (!key) {
      throw new BadRequestException('Image key is required');
    }
    return this.productsService.present(
      await this.productsService.confirmImageUpload(id, key),
      user,
    );
  }

  @Delete(':id/image')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async removeImage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.present(await this.productsService.removeImage(id), user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
