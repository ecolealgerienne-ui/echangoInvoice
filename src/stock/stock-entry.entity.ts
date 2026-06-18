import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Index('IDX_stock_entries_tenant_id', ['tenantId'])
@Index('IDX_stock_entries_raw_material_id', ['rawMaterialId'])
@Index('IDX_stock_entries_status', ['status'])
@Index('IDX_stock_entries_entered_at', ['enteredAt'])
@Index('IDX_stock_entries_expires_at', ['expiresAt'])
@Entity('stock_entries')
export class StockEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'uuid', nullable: true })
  receptionBlId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPerUnit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalCost: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batchNumber: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({
    type: 'enum',
    enum: ['available', 'reserved', 'sold', 'adjusted'],
    default: 'available',
  })
  status: 'available' | 'reserved' | 'sold' | 'adjusted';

  @Column({ type: 'timestamptz' })
  enteredAt: Date;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
