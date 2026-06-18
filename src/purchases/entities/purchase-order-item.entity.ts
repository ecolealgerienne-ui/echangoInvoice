import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

@Index('IDX_po_items_purchase_order_id', ['purchaseOrderId'])
@Index('IDX_po_items_tenant_id', ['tenantId'])
@Index('IDX_po_items_raw_material_id', ['rawMaterialId'])
@Entity('purchase_order_items')
export class PurchaseOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  purchaseOrderId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => PurchaseOrder, (po) => po.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;
}
