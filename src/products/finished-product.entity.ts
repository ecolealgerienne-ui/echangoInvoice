import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  Index, Unique,
} from 'typeorm';

export type ProductType = 'product' | 'material' | 'both';

@Index('IDX_finished_products_tenant_id', ['tenantId'])
@Index('IDX_finished_products_type', ['type'])
@Index('IDX_finished_products_supplier_id', ['supplierId'])
@Unique('UQ_finished_products_code_tenant', ['code', 'tenantId'])
@Entity('finished_products')
export class FinishedProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20, default: 'product' })
  type: ProductType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  defaultSalesPrice: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lastCostPerUnit: number;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Taux de TVA de l'article. En Algérie c'est 19 % ou 9 % **selon le produit** :
   * le saisir ligne par ligne, c'est se tromper un jour sur deux. Nul = on
   * retombe sur le taux par défaut des réglages.
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  taxRate: number | null;

  /** Famille — un texte, pas une table : voir la migration 1750033000000. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  /** Photo en data-URL, mêmes contraintes que le logo (attribut `src`). */
  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minStock: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxStock: number | null;

  /** Unités de stock dans un conditionnement de vente : 12 pour un carton. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  packQuantity: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  packUnit: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // ─── Champs stock (remplace inventory_summary) ──────────────────────────
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  stockQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageCostPerUnit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalStockValue: number;

  @Column({ type: 'timestamptz', nullable: true })
  earliestExpirationDate: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  alertThreshold: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  reservedQuantity: number;

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
