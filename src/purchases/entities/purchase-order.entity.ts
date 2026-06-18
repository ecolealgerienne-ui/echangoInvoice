import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, Index,
} from 'typeorm';
import { PurchaseOrderItem } from './purchase-order-item.entity';

@Index('IDX_purchase_orders_tenant_id', ['tenantId'])
@Index('IDX_purchase_orders_supplier_id', ['supplierId'])
@Index('IDX_purchase_orders_status', ['status'])
@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  poNumber: string;

  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'received', 'cancelled'],
    default: 'draft',
  })
  status: 'draft' | 'sent' | 'received' | 'cancelled';

  @Column({ type: 'date' })
  orderDate: Date;

  @Column({ type: 'date', nullable: true })
  expectedDeliveryDate: Date | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

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

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, { cascade: true })
  items: PurchaseOrderItem[];
}
