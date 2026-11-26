import {
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import { AuthUser, canAccessWarehouse } from '../auth/auth.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    private readonly storage: StorageService,
  ) {}

  async findAll(query?: QueryProductDto): Promise<Product[]> {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.inventories', 'inventory')
      .leftJoinAndSelect('inventory.warehouse', 'warehouse')
      .orderBy('product.createdAt', 'DESC');

    if (query?.category) {
      qb.andWhere('LOWER(category.name) = LOWER(:cat)', {
        cat: query.category.trim(),
      });
    }

    if (query?.search) {
      const term = `%${query.search.toLowerCase().trim()}%`;
      qb.andWhere(
        '(LOWER(product.name) LIKE :term OR LOWER(product.sku) LIKE :term OR LOWER(product.description) LIKE :term)',
        { term },
      );
    }

    return qb.getMany();
  }

  async findCategories(): Promise<{ id: string; name: string; productCount: number }[]> {
    const rows = await this.categoryRepo
      .createQueryBuilder('c')
      .leftJoin('c.products', 'p')
      .select(['c.id AS id', 'c.name AS name', 'COUNT(p.id)::int AS "productCount"'])
      .groupBy('c.id')
      .addGroupBy('c.name')
      .orderBy('c.name', 'ASC')
      .getRawMany<{ id: string; name: string; productCount: number }>();
    return rows;
  }

  async findOne(id: string): Promise<Product> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );

    const product = await this.productRepo.findOne({
      where: isUuid ? { id } : { sku: id.toUpperCase() },
      relations: { category: true, inventories: { warehouse: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID or SKU "${id}" was not found`);
    }

    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const skuUpper = dto.sku.toUpperCase().trim();
    const existing = await this.productRepo.findOne({
      where: { sku: skuUpper },
    });

    if (existing) {
      throw new ConflictException(`Product with SKU "${skuUpper}" already exists`);
    }

    // Resolve or create category
    let category: ProductCategory = null;
    if (dto.category) {
      category = await this.categoryRepo.findOne({
        where: { name: ILike(dto.category.trim()) },
      });
      if (!category) {
        category = await this.categoryRepo.save(
          this.categoryRepo.create({ name: dto.category.trim() }),
        );
      }
    }

    const newProduct = this.productRepo.create({
      sku: skuUpper,
      name: dto.name.trim(),
      description: dto.description,
      category,
      unitOfMeasurement: dto.unitOfMeasurement,
      minimumStockLevel: dto.minimumStockLevel,
      imageUrl: dto.imageUrl,
    });

    const savedProduct = await this.productRepo.save(newProduct);

    // Stock rows are created per warehouse on the first stock movement
    return this.findOne(savedProduct.id);
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);

    if (dto.sku) {
      const skuUpper = dto.sku.toUpperCase().trim();
      if (skuUpper !== product.sku) {
        const existing = await this.productRepo.findOne({
          where: { sku: skuUpper },
        });
        if (existing && existing.id !== product.id) {
          throw new ConflictException(`Product with SKU "${skuUpper}" already exists`);
        }
        product.sku = skuUpper;
      }
    }

    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.unitOfMeasurement !== undefined)
      product.unitOfMeasurement = dto.unitOfMeasurement;
    if (dto.minimumStockLevel !== undefined)
      product.minimumStockLevel = dto.minimumStockLevel;
    if (dto.imageUrl !== undefined) product.imageUrl = dto.imageUrl;

    if (dto.category) {
      let category = await this.categoryRepo.findOne({
        where: { name: ILike(dto.category.trim()) },
      });
      if (!category) {
        category = await this.categoryRepo.save(
          this.categoryRepo.create({ name: dto.category.trim() }),
        );
      }
      product.category = category;
    }

    await this.productRepo.save(product);
    return this.findOne(product.id);
  }

  /** Store an uploaded image in S3 and point the product at it, replacing any previous image. */
  async setImage(id: string, file: Express.Multer.File): Promise<Product> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException('Image storage is not configured (S3_BUCKET_NAME)');
    }
    const product = await this.findOne(id);
    const previousKey = product.imageKey;

    product.imageKey = await this.storage.uploadImage(
      `products/${product.id}`,
      file.buffer,
      file.mimetype,
    );
    await this.productRepo.save(product);

    if (previousKey) await this.storage.delete(previousKey);
    return product;
  }

  async removeImage(id: string): Promise<Product> {
    const product = await this.findOne(id);
    if (product.imageKey) {
      const key = product.imageKey;
      product.imageKey = null;
      await this.productRepo.save(product);
      await this.storage.delete(key);
    }
    return product;
  }

  async getPresignedUploadUrl(
    id: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException('Image storage is not configured (S3_BUCKET_NAME)');
    }
    const product = await this.findOne(id);
    return this.storage.getPresignedUploadUrl(`products/${product.id}`, contentType);
  }

  async confirmImageUpload(id: string, key: string): Promise<Product> {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException('Image storage is not configured (S3_BUCKET_NAME)');
    }
    const product = await this.findOne(id);
    const exists = await this.storage.exists(key);
    if (!exists) {
      throw new NotFoundException(`Object "${key}" was not found in S3 storage`);
    }

    const previousKey = product.imageKey;
    product.imageKey = key;
    await this.productRepo.save(product);

    if (previousKey && previousKey !== key) {
      await this.storage.delete(previousKey);
    }
    return product;
  }

  /**
   * API representation for one user:
   *  - stock is summarised only over warehouses the user may see
   *  - the private S3 key is turned into a short-lived signed URL
   * Returns a plain object so the entity is never saved with these derived fields.
   */
  async present(product: Product, user: AuthUser) {
    const { inventories, ...rest } = product;
    const visible = (inventories ?? []).filter(
      (i) => i.warehouse && canAccessWarehouse(user, i.warehouse.id),
    );
    return {
      ...rest,
      imageUrl:
        product.imageKey && this.storage.enabled
          ? await this.storage.signedReadUrl(product.imageKey)
          : product.imageUrl,
      totalQuantity: visible.reduce((sum, i) => sum + i.quantityOnHand, 0),
      stockByWarehouse: visible
        .map((i) => ({
          warehouseId: i.warehouse.id,
          code: i.warehouse.code,
          quantityOnHand: i.quantityOnHand,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  async remove(id: string): Promise<{ message: string; id: string }> {
    const product = await this.findOne(id);
    const imageKey = product.imageKey;
    await this.productRepo.remove(product);
    if (imageKey) await this.storage.delete(imageKey);
    return {
      message: `Product "${product.name}" (${product.sku}) successfully deleted`,
      id: product.id,
    };
  }
}
