import {
  Entity, PrimaryGeneratedColumn, Column,
  UpdateDateColumn, Index,
} from 'typeorm';

@Index('IDX_inventory_summary_tenant_id', ['tenantId'])
@Index('IDX_inventory_summary_raw_material_id', ['rawMaterialId'])
@Entity('inventory_summary')
export class InventorySummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageCostPerUnit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalValue: number;

  @Column({ type: 'timestamptz', nullable: true })
  earliestExpirationDate: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  alertThreshold: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
