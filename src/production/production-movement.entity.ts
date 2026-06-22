import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ProductionOrder } from './production-order.entity';

export type ProductionMovementType =
  | 'mp_consumption'
  | 'rejection'
  | 'mp_loss';

@Index('IDX_production_movements_tenantId', ['tenantId'])
@Index('IDX_production_movements_productionOrderId', ['productionOrderId'])
@Index('IDX_production_movements_rawMaterialId', ['rawMaterialId'])
@Index('IDX_production_movements_type', ['type'])
@Index('IDX_production_movements_movedAt', ['movedAt'])
@Entity('production_movements')
export class ProductionMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  productionOrderId: string;

  @Column({ type: 'uuid', nullable: true })
  rawMaterialId: string | null;

  @Column({ type: 'uuid', nullable: true })
  finishedProductId: string | null;

  @Column({ type: 'varchar', length: 30 })
  type: ProductionMovementType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', nullable: true })
  loggedBy: string | null;

  @Column({ type: 'timestamptz' })
  movedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ProductionOrder, (o) => o.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productionOrderId' })
  productionOrder: ProductionOrder;
}
