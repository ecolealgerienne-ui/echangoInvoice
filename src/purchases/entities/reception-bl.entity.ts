import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  Index,
} from 'typeorm';

@Index('IDX_reception_bls_tenant_id', ['tenantId'])
@Index('IDX_reception_bls_purchase_order_id', ['purchaseOrderId'])
@Index('IDX_reception_bls_status', ['status'])
@Entity('reception_bls')
export class ReceptionBL {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30 })
  blNumber: string;

  @Column({ type: 'uuid' })
  purchaseOrderId: string;

  @Column({ type: 'date' })
  receptionDate: Date;

  @Column({
    type: 'enum',
    enum: ['pending', 'partial', 'completed'],
    default: 'pending',
  })
  status: 'pending' | 'partial' | 'completed';

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalQuantityReceived: number;

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
}
