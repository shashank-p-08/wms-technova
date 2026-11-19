import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  Index,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity';
import { User } from '../../users/entities/user.entity';

@Entity('warehouses')
@Index(['company', 'code'], { unique: true })
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, (c) => c.warehouses, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  /** Short code shown in the UI and used in references, e.g. HUB-01 */
  @Column({ length: 20 })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  /** Inactive warehouses keep their history but accept no new stock movements */
  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => User, (u) => u.warehouses)
  employees: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
