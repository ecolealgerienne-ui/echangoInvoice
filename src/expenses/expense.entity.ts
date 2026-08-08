import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index,
} from 'typeorm';

@Index('IDX_expenses_tenant_id', ['tenantId'])
@Index('IDX_expenses_category', ['category'])
@Index('IDX_expenses_expense_date', ['expenseDate'])
@Index('IDX_expenses_is_approved', ['isApproved'])
@Index('IDX_expenses_deleted_at', ['deletedAt'])
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'date' })
  expenseDate: Date;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({
    type: 'enum',
    enum: ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'],
  })
  category: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: false })
  isApproved: boolean;

  /** Fournisseur, quand la dépense vient d'une facture. Détaché, pas effacé,
   *  si le fournisseur disparaît. */
  @Column({ type: 'uuid', nullable: true })
  supplierId: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  vatRate: number | null;

  /**
   * TVA récupérable. Elle manquait au G50 : nous n'y comptions que les factures
   * fournisseurs, alors qu'une dépense sur facture ouvre le même droit.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  vatAmount: number;

  /** Loyer, salaires : signalé pour être repéré, pas engendré automatiquement. */
  @Column({ type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'varchar', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

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
}
