import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, Index, Unique,
} from 'typeorm';
import { ProductionMovement } from './production-movement.entity';

export type ProductionOrderStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';
export type ProductionOrderPriority = 'normal' | 'urgent';

@Index('IDX_production_orders_tenantId', ['tenantId'])
@Index('IDX_production_orders_status', ['status'])
@Index('IDX_production_orders_nomenclatureId', ['nomenclatureId'])
@Index('IDX_production_orders_finishedProductId', ['finishedProductId'])
@Index('IDX_production_orders_responsibleUserId', ['responsibleUserId'])
@Index('IDX_production_orders_createdAt', ['createdAt'])
@Unique('UQ_production_orders_ref_tenantId', ['ref', 'tenantId'])
@Entity('production_orders')
export class ProductionOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30 })
  ref: string;

  @Column({ type: 'uuid' })
  nomenclatureId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityToProduce: number;

  @Column({ type: 'varchar', length: 20, default: 'planned' })
  status: ProductionOrderStatus;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  priority: ProductionOrderPriority;

  @Column({ type: 'uuid', nullable: true })
  responsibleUserId: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  estimatedCost: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  actualCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityProduced: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityRejected: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  yieldPercentage: number;

  @Column({ type: 'timestamptz', nullable: true })
  plannedStartDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  plannedEndDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualStartDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  actualEndDate: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @OneToMany(() => ProductionMovement, (m) => m.productionOrder, { eager: true })
  movements: ProductionMovement[];
}
