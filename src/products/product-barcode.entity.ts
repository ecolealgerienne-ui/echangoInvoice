import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  Index, Unique, ManyToOne, JoinColumn,
} from 'typeorm';
import { FinishedProduct } from './finished-product.entity';

/**
 * Types reconnus. `INTERNE` couvre les codes fabriqués par la société
 * elle-même, qui ne respectent aucune norme et n'ont pas à en respecter.
 */
export type TypeCodeBarres = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128' | 'INTERNE';

@Index('IDX_product_barcodes_tenantId', ['tenantId'])
@Index('IDX_product_barcodes_productId', ['finishedProductId'])
@Index('IDX_product_barcodes_lookup', ['tenantId', 'barcode'])
@Unique('UQ_product_barcodes_code_tenant', ['barcode', 'tenantId'])
@Entity('product_barcodes')
export class ProductBarcode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'varchar', length: 64 })
  barcode: string;

  @Column({ type: 'varchar', length: 20, default: 'INTERNE' })
  type: TypeCodeBarres;

  /**
   * Nombre d'unités de stock représentées par ce code. Scanner le code du
   * carton doit ajouter douze unités, pas une.
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  packQuantity: number;

  /** Le code proposé par défaut pour l'étiquetage. */
  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  /** « Carton de 12 », « Palette » — ce qui distingue deux codes à l'écran. */
  @Column({ type: 'varchar', length: 60, nullable: true })
  label: string | null;

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

  @ManyToOne(() => FinishedProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'finishedProductId' })
  product: FinishedProduct;
}
