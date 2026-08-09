import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index, Unique,
} from 'typeorm';

@Index('IDX_product_suppliers_tenantId', ['tenantId'])
@Index('IDX_product_suppliers_productId', ['finishedProductId'])
@Index('IDX_product_suppliers_supplierId', ['supplierId'])
@Unique('UQ_product_suppliers_pair', ['finishedProductId', 'supplierId', 'tenantId'])
@Entity('product_suppliers')
export class ProductSupplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'uuid' })
  supplierId: string;

  /** Référence de l'article chez CE fournisseur — ce qu'on écrit sur la commande. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  supplierRef: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  purchasePrice: number;

  /** Délai annoncé, en jours. Décide autant que le prix quand le stock est bas. */
  @Column({ type: 'int', nullable: true })
  leadTimeDays: number | null;

  /** Conditionnement imposé : commander 7 unités chez qui vend par 12 n'a pas de sens. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  packQuantity: number;

  @Column({ type: 'boolean', default: false })
  isPreferred: boolean;

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
