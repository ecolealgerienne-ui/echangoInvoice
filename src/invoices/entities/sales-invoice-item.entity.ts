import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { SalesInvoice } from './sales-invoice.entity';

@Index('IDX_sales_invoice_items_invoice_id', ['salesInvoiceId'])
@Index('IDX_sales_invoice_items_tenant_id', ['tenantId'])
@Index('IDX_sales_invoice_items_product_id', ['finishedProductId'])
@Entity('sales_invoice_items')
export class SalesInvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  salesInvoiceId: string;

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

  @ManyToOne(() => SalesInvoice, (inv) => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salesInvoiceId' })
  salesInvoice: SalesInvoice;
}
