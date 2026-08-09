import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index,
} from 'typeorm';

@Index('IDX_stock_entries_tenant_id', ['tenantId'])
@Index('IDX_stock_entries_raw_material_id', ['rawMaterialId'])
@Index('IDX_stock_entries_status', ['status'])
@Index('IDX_stock_entries_entered_at', ['enteredAt'])
@Index('IDX_stock_entries_expires_at', ['expiresAt'])
@Index('IDX_stock_entries_consumed_by_po', ['consumedByProductionOrderId'])
@Index('IDX_stock_entries_produced_by_po', ['producedByProductionOrderId'])
@Entity('stock_entries')
export class StockEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'uuid', nullable: true })
  receptionBlId: string | null;

  @Column({ type: 'uuid', nullable: true })
  finishedProductId: string | null;

  @Column({ type: 'uuid', nullable: true })
  reservedByDeliveryNoteId: string | null;

  /**
   * L'ordre de fabrication qui a consommé ce lot, et celui qui l'a produit.
   *
   * Les deux ensemble donnent la traçabilité amont/aval : depuis un lot de
   * produit fini on remonte aux lots de matière, et depuis un lot de matière on
   * redescend aux produits qui en sont issus. Sans eux, une alerte sanitaire sur
   * une matière ne dit pas quels produits rappeler.
   */
  @Column({ type: 'uuid', nullable: true })
  consumedByProductionOrderId: string | null;

  @Column({ type: 'uuid', nullable: true })
  producedByProductionOrderId: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPerUnit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalCost: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  batchNumber: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /**
   * `consumed` désigne une sortie par la production, distincte de `adjusted`
   * qui désigne une régularisation d'inventaire. Les confondre rendrait les
   * états illisibles : une consommation d'atelier n'est pas une correction
   * d'erreur de comptage.
   */
  @Column({
    type: 'enum',
    enum: ['available', 'reserved', 'sold', 'adjusted', 'consumed'],
    default: 'available',
  })
  status: 'available' | 'reserved' | 'sold' | 'adjusted' | 'consumed';

  @Column({ type: 'timestamptz' })
  enteredAt: Date;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
