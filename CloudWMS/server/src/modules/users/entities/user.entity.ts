import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { InventoryTransaction } from '../../inventory/entities/inventory-transaction.entity';
import { Company } from '../../company/entities/company.entity';
import { Warehouse } from '../../warehouses/entities/warehouse.entity';

/**
 * Company-wide role. What a user may do is role x warehouse assignment:
 *   ADMIN   - everything, in every warehouse; manages users and warehouses
 *   MANAGER - products + all stock movements incl. adjustments, in assigned warehouses
 *   STAFF   - receive (stock in) and dispatch (stock out), in assigned warehouses
 *   VIEWER  - read-only, in assigned warehouses (auditors, finance)
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
  VIEWER = 'VIEWER',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (c) => c.users, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ unique: true })
  email: string;

  // Never selected by default so it can't leak through relations (e.g. transaction history)
  @Column({ select: false })
  passwordHash: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.STAFF })
  role: UserRole;

  /** Warehouses this employee works in. ADMINs implicitly have access to all. */
  @ManyToMany(() => Warehouse, (w) => w.employees)
  @JoinTable({
    name: 'user_warehouses',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'warehouse_id' },
  })
  warehouses: Warehouse[];

  /** Deactivated users cannot sign in; their audit history is kept. */
  @Column({ default: true })
  isActive: boolean;

  // ---- sign-in protection (never exposed by the API) ----
  @Column({ type: 'int', default: 0, select: false })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Bumped on password change / deactivation to invalidate already-issued tokens */
  @Column({ type: 'int', default: 0, select: false })
  tokenVersion: number;

  @OneToMany(() => InventoryTransaction, (tx) => tx.user)
  transactions: InventoryTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
