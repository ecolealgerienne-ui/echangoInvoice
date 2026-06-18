import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, Index, Unique,
} from 'typeorm';
import { QuoteItem } from './quote-item.entity';

@Index('IDX_quotes_tenant_id', ['tenantId'])
@Index('IDX_quotes_customer_id', ['customerId'])
@Index('IDX_quotes_status', ['status'])
@Index('IDX_quotes_quote_date', ['quoteDate'])
@Index('IDX_quotes_expiry_date', ['expiryDate'])
@Index('IDX_quotes_deleted_at', ['deletedAt'])
@Index('IDX_quotes_converted_invoice', ['convertedToInvoiceId'])
@Unique('UQ_quotes_number_tenant', ['quoteNumber', 'tenantId'])
@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  quoteNumber: string;

  @Column({ type: 'uuid' })
  customerId: string;

  @Column({ type: 'date' })
  quoteDate: Date;

  @Column({ type: 'date', nullable: true })
  expiryDate: Date | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  convertedToInvoiceId: string | null;

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

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];
}
