import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, Index,
} from 'typeorm';
import { ProductionMovement } from './production-movement.entity';

export type ProductionOrderStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';
export type ProductionOrderPriority = 'normal' | 'urgent';

@Index('IDX_production_orders_tenantId', ['tenantId'])
@Index('IDX_production_orders_status', ['status'])
@Index('IDX_production_orders_nomenclatureId', ['nomenclatureId'])
@Index('IDX_production_orders_finishedProductId', ['finishedProductId'])
@Entity('production_orders')
export class ProductionOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 50 })
  reference: string;

  @Column({ type: 'uuid' })
  nomenclatureId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ProductionOrderStatus;

  @Column({ type: 'varchar', length: 20, default: 'normal' })
  priority: ProductionOrderPriority;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityOrdered: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantityProduced: number;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledStartDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledEndDate: Date | null;

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
