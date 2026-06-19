import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  Index, Unique,
} from 'typeorm';

export type ProductType = 'product' | 'material' | 'both';

@Index('IDX_finished_products_tenant_id', ['tenantId'])
@Index('IDX_finished_products_type', ['type'])
@Index('IDX_finished_products_supplier_id', ['supplierId'])
@Unique('UQ_finished_products_code_tenant', ['code', 'tenantId'])
@Entity('finished_products')
export class FinishedProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20, default: 'product' })
  type: ProductType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  defaultSalesPrice: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lastCostPerUnit: number;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
