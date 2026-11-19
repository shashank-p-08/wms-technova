import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { Inventory } from '../../inventory/entities/inventory.entity';
import { InventoryTransaction } from '../../inventory/entities/inventory-transaction.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The unique constraint already creates an index; a separate @Index would duplicate it
  @Column({ unique: true })
  sku: string;

  @Index()
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => ProductCategory, (category) => category.products, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  category: ProductCategory;

  @Column({ default: 'pcs' })
  unitOfMeasurement: string;

  @Column({ type: 'int', default: 0 })
  minimumStockLevel: number;

  @Column({ nullable: true })
  imageUrl: string;

  /** S3 object key of an uploaded product image (bucket stays private; served via signed URL) */
  @Column({ name: 'image_key', nullable: true })
  imageKey: string;

  /** One balance row per warehouse the product has been stocked in */
  @OneToMany(() => Inventory, (inventory) => inventory.product)
  inventories: Inventory[];

  @OneToMany(() => InventoryTransaction, (tx) => tx.product)
  transactions: InventoryTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
