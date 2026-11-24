import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import {
  InventoryTransaction,
  TransactionType,
} from './entities/inventory-transaction.entity';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { StockInDto } from './dto/stock-in.dto';
import { StockOutDto } from './dto/stock-out.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { AuthUser, assertWarehouseAccess } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';
import { WarehousesService } from '../warehouses/warehouses.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepo: Repository<InventoryTransaction>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly warehouses: WarehousesService,
  ) {}

  private status(qty: number, min: number): StockStatus {
    if (qty === 0) return 'OUT_OF_STOCK';
    if (qty <= min) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  /** Checks the user may work in the warehouse and that it is active in their company. */
  private async authorizeWarehouse(user: AuthUser, warehouseId: string): Promise<Warehouse> {
    assertWarehouseAccess(user, warehouseId);
    return this.warehouses.getActiveForCompany(user.companyId, warehouseId);
  }

  /**
   * Resolve the product (by id or SKU) and its balance row in this warehouse, creating
   * the row on first use, and lock it (SELECT ... FOR UPDATE) for the rest of the
   * transaction so concurrent movements cannot lose updates. Must run in a transaction.
   */
  private async lockBalance(
    manager: EntityManager,
    productRef: string,
    warehouse: Warehouse,
  ): Promise<{ product: Product; inventory: Inventory }> {
    const product = await manager.findOne(Product, {
      where: UUID_RE.test(productRef) ? { id: productRef } : { sku: productRef.toUpperCase() },
    });
    if (!product) throw new NotFoundException(`Product "${productRef}" was not found`);

    // Insert-if-missing without racing: ON CONFLICT DO NOTHING on (product, warehouse)
    await manager
      .createQueryBuilder()
      .insert()
      .into(Inventory)
      .values({ product: { id: product.id }, warehouse: { id: warehouse.id }, quantityOnHand: 0 })
      .orIgnore()
      .execute();

    const inventory = await manager.findOne(Inventory, {
      where: { product: { id: product.id }, warehouse: { id: warehouse.id } },
      lock: { mode: 'pessimistic_write' },
    });
    return { product, inventory };
  }

  /** Shared, atomic implementation of every stock movement. */
  private async move(
    user: AuthUser,
    warehouseId: string,
    productRef: string,
    type: TransactionType,
    reference: string,
    notes: string | undefined,
    computeAfter: (before: number, product: Product) => number,
  ) {
    const warehouse = await this.authorizeWarehouse(user, warehouseId);

    return this.dataSource.transaction(async (manager) => {
      const { product, inventory } = await this.lockBalance(manager, productRef, warehouse);
      const quantityBefore = inventory.quantityOnHand;
      const quantityAfter = computeAfter(quantityBefore, product);
      const delta = quantityAfter - quantityBefore;

      inventory.quantityOnHand = quantityAfter;
      await manager.save(Inventory, inventory);

      const tx = await manager.save(
        InventoryTransaction,
        manager.create(InventoryTransaction, {
          product,
          warehouse,
          user: { id: user.id },
          type,
          quantity: type === TransactionType.ADJUSTMENT ? delta : Math.abs(delta),
          quantityBefore,
          quantityAfter,
          reference: reference.trim(),
          notes,
        }),
      );

      return {
        success: true,
        product,
        warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
        sku: product.sku,
        quantityBefore,
        quantityAfter,
        delta,
        transactionId: tx.id,
        reference: tx.reference,
        transactedAt: tx.transactedAt,
        performedBy: user.email,
      };
    });
  }

  /** Stock position of every catalogue product in one warehouse. */
  async getOverview(user: AuthUser, warehouseId: string) {
    const warehouse = await this.authorizeWarehouse(user, warehouseId);
    const products = await this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.inventories', 'inv', 'inv.warehouse_id = :wid', { wid: warehouse.id })
      .orderBy('p.name', 'ASC')
      .getMany();

    return products.map((p) => {
      const inv = p.inventories?.[0];
      const qty = inv?.quantityOnHand ?? 0;
      const min = p.minimumStockLevel ?? 0;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category?.name ?? 'Uncategorized',
        unitOfMeasurement: p.unitOfMeasurement,
        quantityOnHand: qty,
        minimumStockLevel: min,
        status: this.status(qty, min),
        lastUpdated: inv?.updatedAt ?? p.updatedAt,
        warehouseId: warehouse.id,
      };
    });
  }

  async getLowStockItems(user: AuthUser, warehouseId: string) {
    const overview = await this.getOverview(user, warehouseId);
    return overview.filter((i) => i.status !== 'IN_STOCK');
  }

  async stockIn(user: AuthUser, dto: StockInDto) {
    const r = await this.move(user, dto.warehouseId, dto.productId, TransactionType.STOCK_IN,
      dto.reference, dto.notes, (before) => before + dto.quantity);
    const { product, ...rest } = r;
    return { ...rest, message: `Received ${dto.quantity} ${product.unitOfMeasurement} of "${product.name}" into ${r.warehouse.code}` };
  }

  async stockOut(user: AuthUser, dto: StockOutDto) {
    const r = await this.move(user, dto.warehouseId, dto.productId, TransactionType.STOCK_OUT,
      dto.reference, dto.notes, (before, product) => {
        if (before < dto.quantity) {
          throw new BadRequestException(
            `Cannot dispatch ${dto.quantity} units of "${product.name}". Only ${before} ${product.unitOfMeasurement} available in this warehouse.`,
          );
        }
        return before - dto.quantity;
      });
    const { product, ...rest } = r;
    return { ...rest, message: `Dispatched ${dto.quantity} ${product.unitOfMeasurement} of "${product.name}" from ${r.warehouse.code}` };
  }

  async adjustStock(user: AuthUser, dto: AdjustStockDto) {
    const r = await this.move(user, dto.warehouseId, dto.productId, TransactionType.ADJUSTMENT,
      dto.reference, dto.notes ?? 'Inventory cycle count adjustment', () => dto.newQuantity);
    const { product, ...rest } = r;
    return {
      ...rest,
      message: `Adjusted "${product.name}" in ${r.warehouse.code} from ${r.quantityBefore} to ${r.quantityAfter} (delta: ${r.delta > 0 ? '+' : ''}${r.delta})`,
    };
  }

  /** Audit ledger, limited to warehouses the user can see. */
  async getTransactionHistory(user: AuthUser, warehouseId: string | undefined, limit = 50) {
    let warehouseIds: string[] | undefined;
    if (warehouseId) {
      assertWarehouseAccess(user, warehouseId);
      warehouseIds = [warehouseId];
    } else if (user.role !== UserRole.ADMIN) {
      if (!user.warehouseIds.length) return [];
      warehouseIds = user.warehouseIds;
    }

    return this.transactionRepo.find({
      where: {
        warehouse: warehouseIds ? { id: In(warehouseIds) } : { company: { id: user.companyId } },
      },
      relations: { product: true, user: true, warehouse: true },
      select: {
        user: { id: true, email: true, firstName: true, lastName: true },
        warehouse: { id: true, code: true, name: true },
      },
      order: { transactedAt: 'DESC' },
      take: limit,
    });
  }

  /** Export warehouse inventory list as CSV formatted string. */
  async exportCsv(user: AuthUser, warehouseId: string): Promise<string> {
    const overview = await this.getOverview(user, warehouseId);
    const headers = [
      'SKU',
      'Product Name',
      'Category',
      'Quantity On Hand',
      'Minimum Stock Level',
      'Unit',
      'Status',
    ];
    const rows = overview.map((item) => [
      `"${item.sku.replace(/"/g, '""')}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      item.quantityOnHand,
      item.minimumStockLevel,
      `"${item.unitOfMeasurement.replace(/"/g, '""')}"`,
      item.status,
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}
