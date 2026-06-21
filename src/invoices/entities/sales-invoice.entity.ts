import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { SalesInvoiceItem } from './sales-invoice-item.entity';
import { Payment } from './payment.entity';
import { Customer } from '../../customers/customer.entity';

@Index('IDX_sales_invoices_tenant_id', ['tenantId'])
@Index('IDX_sales_invoices_customer_id', ['customerId'])
@Index('IDX_sales_invoices_delivery_note', ['deliveryNoteId'])
@Index('IDX_sales_invoices_quote_id', ['quoteId'])
@Index('IDX_sales_invoices_status', ['status'])
@Index('IDX_sales_invoices_invoice_date', ['invoiceDate'])
@Index('IDX_sales_invoices_due_date', ['dueDate'])
@Index('IDX_sales_invoices_deleted_at', ['deletedAt'])
@Unique('UQ_sales_invoices_number_tenant', ['invoiceNumber', 'tenantId'])
@Entity('sales_invoices')
export class SalesInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  invoiceNumber: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'uuid', nullable: true })
  deliveryNoteId: string | null;

  @Column({ type: 'uuid', nullable: true })
  quoteId: string | null;

  @Column({ type: 'date' })
  invoiceDate: Date;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountDue: number;

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

  @OneToMany(() => SalesInvoiceItem, (item) => item.salesInvoice, { cascade: true })
  items: SalesInvoiceItem[];

  @OneToMany(() => Payment, (p) => p.salesInvoice)
  payments: Payment[];
}
