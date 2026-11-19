import { randomBytes } from 'crypto';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { ProductCategory } from '../products/entities/product-category.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { InventoryTransaction } from '../inventory/entities/inventory-transaction.entity';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../auth/password';

const SEED_PRODUCTS = [
  { sku: 'WMS-SCN-001', name: 'Industrial Barcode Scanner', description: 'Rugged 2D wireless barcode scanner with charging cradle', category: 'Hardware', unit: 'pcs', min: 10, stock: 50 },
  { sku: 'WMS-LBL-500', name: 'Thermal Shipping Labels (Roll)', description: '4x6 inch direct thermal shipping labels, 500 per roll', category: 'Packaging', unit: 'rolls', min: 50, stock: 120 },
  { sku: 'WMS-PLT-250', name: 'Hydraulic Pallet Jack 2.5T', description: 'Heavy duty manual pallet truck with polyurethane wheels', category: 'Heavy Equipment', unit: 'pcs', min: 2, stock: 8 },
  { sku: 'WMS-BIN-040', name: 'Stackable Storage Bins (Blue)', description: 'Heavy duty polypropylene bins for warehouse racking', category: 'Storage', unit: 'boxes', min: 20, stock: 85 },
];

/**
 * Idempotent start-up tasks, safe to run on every boot:
 *  1. ensure the company and at least one warehouse exist
 *  2. move data created before multi-warehouse support into the first warehouse
 *  3. create the first admin if there are no users
 *  4. seed sample products into an empty database
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Bootstrap');

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const company = await this.ensureCompany();
    const warehouse = await this.ensureWarehouse(company);
    await this.backfill(company, warehouse);
    await this.ensureAdmin(company);
    await this.seedProducts(warehouse);
  }

  private async ensureCompany(): Promise<Company> {
    const repo = this.dataSource.getRepository(Company);
    const existing = await repo.find({ order: { createdAt: 'ASC' }, take: 1 });
    if (existing[0]) return existing[0];
    const name = this.config.get<string>('COMPANY_NAME', 'TechNova Logistics');
    this.logger.log(`Creating company "${name}"`);
    return repo.save(repo.create({ name }));
  }

  private async ensureWarehouse(company: Company): Promise<Warehouse> {
    const repo = this.dataSource.getRepository(Warehouse);
    const existing = await repo.find({ where: { company: { id: company.id } }, order: { code: 'ASC' }, take: 1 });
    if (existing[0]) return existing[0];
    this.logger.log('Creating first warehouse HUB-01');
    return repo.save(repo.create({ company, code: 'HUB-01', name: 'North Facility' }));
  }

  private async backfill(company: Company, warehouse: Warehouse) {
    const users = await this.dataSource.getRepository(User).update({ company: IsNull() }, { company });
    const inv = await this.dataSource.getRepository(Inventory).update({ warehouse: IsNull() }, { warehouse });
    const txs = await this.dataSource
      .getRepository(InventoryTransaction)
      .update({ warehouse: IsNull() }, { warehouse });
    const moved = [
      users.affected && `${users.affected} user(s) -> ${company.name}`,
      inv.affected && `${inv.affected} stock balance(s) -> ${warehouse.code}`,
      txs.affected && `${txs.affected} transaction(s) -> ${warehouse.code}`,
    ].filter(Boolean);
    if (moved.length) this.logger.log(`Migrated pre-warehouse data: ${moved.join(', ')}`);
  }

  private async ensureAdmin(company: Company) {
    const repo = this.dataSource.getRepository(User);
    if ((await repo.count()) > 0) return;

    const email = (this.config.get<string>('ADMIN_EMAIL') || 'admin@technova.local').toLowerCase();
    let password = this.config.get<string>('ADMIN_PASSWORD');
    const generated = !password || password.length < PASSWORD_MIN_LENGTH;
    if (generated) password = randomBytes(12).toString('base64url');

    await repo.save(
      repo.create({
        email,
        firstName: 'System',
        lastName: 'Administrator',
        role: UserRole.ADMIN,
        company,
        passwordHash: await hashPassword(password),
      }),
    );
    if (generated) {
      // Printed once, only when no ADMIN_PASSWORD was configured. Change it after first sign-in.
      this.logger.warn(
        `Created first admin ${email} with a generated password: ${password}  ` +
          '(set ADMIN_EMAIL / ADMIN_PASSWORD in .env to choose your own; change it after signing in)',
      );
    } else {
      this.logger.log(`Created first admin ${email} (password from ADMIN_PASSWORD)`);
    }
  }

  private async seedProducts(warehouse: Warehouse) {
    if ((await this.dataSource.getRepository(Product).count()) > 0) return;
    this.logger.log(`Seeding sample products into ${warehouse.code}`);
    await this.dataSource.transaction(async (m) => {
      for (const s of SEED_PRODUCTS) {
        let category = await m.findOne(ProductCategory, { where: { name: s.category } });
        category ??= await m.save(m.create(ProductCategory, { name: s.category }));
        const product = await m.save(
          m.create(Product, {
            sku: s.sku,
            name: s.name,
            description: s.description,
            category,
            unitOfMeasurement: s.unit,
            minimumStockLevel: s.min,
          }),
        );
        await m.save(m.create(Inventory, { product, warehouse, quantityOnHand: s.stock }));
      }
    });
  }
}
