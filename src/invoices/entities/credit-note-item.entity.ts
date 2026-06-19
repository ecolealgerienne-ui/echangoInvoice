import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { CreditNote } from './credit-note.entity';

@Entity('credit_note_items')
export class CreditNoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  creditNoteId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  taxName1: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate1: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount1: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineTaxTotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  lineTotal: number;

  @ManyToOne(() => CreditNote, cn => cn.items)
  @JoinColumn({ name: 'creditNoteId' })
  creditNote: CreditNote;
}
