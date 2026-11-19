import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';
import type { CreateWarehouseDto, UpdateWarehouseDto } from './warehouses.controller';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse) private readonly warehouses: Repository<Warehouse>,
    private readonly dataSource: DataSource,
  ) {}

  async list(user: AuthUser) {
    const qb = this.warehouses
      .createQueryBuilder('w')
      .leftJoin('w.employees', 'e')
      .select(['w.id AS id', 'w.code AS code', 'w.name AS name', 'w.address AS address', 'w.isActive AS "isActive"'])
      .addSelect('COUNT(e.id)::int', 'employeeCount')
      .addSelect(
        (sq) =>
          sq
            .select('COALESCE(SUM(i.quantity_on_hand), 0)::int')
            .from('inventory', 'i')
            .where('i.warehouse_id = w.id'),
        'totalUnits',
      )
      .where('w.company_id = :companyId', { companyId: user.companyId })
      .groupBy('w.id')
      .orderBy('w.code', 'ASC');

    if (user.role !== UserRole.ADMIN) {
      if (!user.warehouseIds.length) return [];
      qb.andWhere('w.id IN (:...ids)', { ids: user.warehouseIds });
    }
    return qb.getRawMany();
  }

  async create(admin: AuthUser, dto: CreateWarehouseDto) {
    const code = dto.code.toUpperCase();
    const exists = await this.warehouses.exists({ where: { code, company: { id: admin.companyId } } });
    if (exists) throw new ConflictException(`Warehouse code ${code} is already in use`);
    const saved = await this.warehouses.save(
      this.warehouses.create({
        code,
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        company: { id: admin.companyId },
      }),
    );
    return { id: saved.id, code: saved.code, name: saved.name, address: saved.address, isActive: saved.isActive };
  }

  async update(admin: AuthUser, id: string, dto: UpdateWarehouseDto) {
    const w = await this.warehouses.findOne({ where: { id, company: { id: admin.companyId } } });
    if (!w) throw new NotFoundException('Warehouse not found');
    if (dto.name !== undefined) w.name = dto.name.trim();
    if (dto.address !== undefined) w.address = dto.address.trim() || null;
    if (dto.isActive !== undefined) w.isActive = dto.isActive;
    await this.warehouses.save(w);
    return { id: w.id, code: w.code, name: w.name, address: w.address, isActive: w.isActive };
  }

  /** Throws unless the warehouse belongs to the user's company and is active. */
  async getActiveForCompany(companyId: string, warehouseId: string): Promise<Warehouse> {
    const w = await this.dataSource.getRepository(Warehouse).findOne({
      where: { id: warehouseId, company: { id: companyId } },
    });
    if (!w) throw new NotFoundException('Warehouse not found');
    if (!w.isActive) throw new ConflictException(`Warehouse ${w.code} is inactive`);
    return w;
  }
}
