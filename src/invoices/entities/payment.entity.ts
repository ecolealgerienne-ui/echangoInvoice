import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { SalesInvoice } from './sales-invoice.entity';

@Index('IDX_payments_tenant_id', ['tenantId'])
@Index('IDX_payments_sales_invoice_id', ['salesInvoiceId'])
@Index('IDX_payments_payment_date', ['paymentDate'])
@Index('IDX_payments_deleted_at', ['deletedAt'])
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  salesInvoiceId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({
    type: 'enum',
    enum: ['cash', 'bank_transfer', 'cheque', 'other'],
  })
  paymentMethod: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

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

  @ManyToOne(() => SalesInvoice, (inv) => inv.payments)
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice: SalesInvoice;
}
