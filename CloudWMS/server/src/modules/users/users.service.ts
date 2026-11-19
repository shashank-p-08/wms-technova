import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Warehouse } from '../warehouses/entities/warehouse.entity';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { hashPassword } from '../auth/password';
import { AuthUser } from '../auth/auth.types';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Warehouse) private readonly warehouses: Repository<Warehouse>,
  ) {}

  private present(u: User) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      warehouses:
        u.role === UserRole.ADMIN
          ? [] // all warehouses implicitly
          : (u.warehouses ?? [])
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((w) => ({ id: w.id, code: w.code, name: w.name })),
    };
  }

  async list(admin: AuthUser) {
    const users = await this.users.find({
      where: { company: { id: admin.companyId } },
      relations: { warehouses: true },
      order: { role: 'ASC', firstName: 'ASC' },
    });
    return users.map((u) => this.present(u));
  }

  private async resolveWarehouses(admin: AuthUser, ids: string[] = []): Promise<Warehouse[]> {
    if (!ids.length) return [];
    const found = await this.warehouses.find({
      where: { id: In(ids), company: { id: admin.companyId } },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('One or more warehouses do not exist in your company');
    }
    return found;
  }

  private async findInCompany(admin: AuthUser, id: string): Promise<User> {
    const user = await this.users.findOne({
      where: { id, company: { id: admin.companyId } },
      relations: { warehouses: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(admin: AuthUser, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ where: { email } })) {
      throw new ConflictException(`A user with email ${email} already exists`);
    }
    if (dto.role !== UserRole.ADMIN && !dto.warehouseIds?.length) {
      throw new BadRequestException('Assign at least one warehouse to a non-admin employee');
    }
    const user = this.users.create({
      email,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName?.trim() || null,
      role: dto.role,
      passwordHash: await hashPassword(dto.password),
      company: { id: admin.companyId },
      warehouses: dto.role === UserRole.ADMIN ? [] : await this.resolveWarehouses(admin, dto.warehouseIds),
    });
    const saved = await this.users.save(user);
    return this.present(await this.findInCompany(admin, saved.id));
  }

  async update(admin: AuthUser, id: string, dto: UpdateUserDto) {
    const user = await this.findInCompany(admin, id);
    const isSelf = user.id === admin.id;

    if (isSelf && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (isSelf && dto.role && dto.role !== UserRole.ADMIN) {
      throw new BadRequestException('You cannot remove your own admin role');
    }
    const losingAdmin =
      user.role === UserRole.ADMIN &&
      ((dto.role && dto.role !== UserRole.ADMIN) || dto.isActive === false);
    if (losingAdmin) {
      const activeAdmins = await this.users.count({
        where: { company: { id: admin.companyId }, role: UserRole.ADMIN, isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException('The company must keep at least one active admin');
      }
    }

    const role = dto.role ?? user.role;
    if (dto.firstName !== undefined) user.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) user.lastName = dto.lastName.trim() || null;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.warehouseIds !== undefined) user.warehouses = await this.resolveWarehouses(admin, dto.warehouseIds);
    if (role === UserRole.ADMIN) user.warehouses = [];
    if (role !== UserRole.ADMIN && !user.warehouses.length) {
      throw new BadRequestException('Assign at least one warehouse to a non-admin employee');
    }

    await this.users.save(user);

    // Password reset or deactivation: revoke existing sessions and clear any lockout
    const revoke = dto.password !== undefined || dto.isActive === false;
    if (revoke) {
      await this.users
        .createQueryBuilder()
        .update(User)
        .set({
          ...(dto.password !== undefined ? { passwordHash: await hashPassword(dto.password) } : {}),
          tokenVersion: () => '"tokenVersion" + 1',
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where('id = :id', { id: user.id })
        .execute();
    }
    return this.present(await this.findInCompany(admin, id));
  }
}
