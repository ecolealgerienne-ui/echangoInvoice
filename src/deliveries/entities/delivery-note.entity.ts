import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { DeliveryNoteItem } from './delivery-note-item.entity';
import { Customer } from '../../customers/customer.entity';

@Index('IDX_delivery_notes_tenant_id', ['tenantId'])
@Index('IDX_delivery_notes_customer_id', ['customerId'])
@Index('IDX_delivery_notes_status', ['status'])
@Index('IDX_delivery_notes_delivery_date', ['deliveryDate'])
@Index('IDX_delivery_notes_deleted_at', ['deletedAt'])
@Index('IDX_delivery_notes_converted_invoice', ['convertedToInvoiceId'])
@Unique('UQ_delivery_notes_bl_number_tenant', ['blNumber', 'tenantId'])
@Entity('delivery_notes')
export class DeliveryNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  blNumber: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'date' })
  deliveryDate: Date;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'signed', 'delivered'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  customerSignature: string | null;

  @Column({ type: 'date', nullable: true })
  signedDate: Date | null;

  @Column({ type: 'uuid', nullable: true })
  convertedToInvoiceId: string | null;

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

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @OneToMany(() => DeliveryNoteItem, (item) => item.deliveryNote, { cascade: true })
  items: DeliveryNoteItem[];
}
