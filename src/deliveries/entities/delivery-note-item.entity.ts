import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { DeliveryNote } from './delivery-note.entity';

@Index('IDX_delivery_note_items_delivery_note_id', ['deliveryNoteId'])
@Index('IDX_delivery_note_items_tenant_id', ['tenantId'])
@Index('IDX_delivery_note_items_product_id', ['finishedProductId'])
@Entity('delivery_note_items')
export class DeliveryNoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  deliveryNoteId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  taxName1: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate1: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount1: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  taxName2: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate2: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount2: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineTaxTotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => DeliveryNote, (dn) => dn.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryNoteId' })
  deliveryNote: DeliveryNote;
}
