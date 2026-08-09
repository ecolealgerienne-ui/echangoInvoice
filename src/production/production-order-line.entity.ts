import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductionOrder } from './production-order.entity';

/**
 * La recette **figée** au démarrage d'un ordre de fabrication.
 *
 * L'ordre ne portait que `nomenclatureId`. Modifier une nomenclature réécrivait
 * donc rétroactivement ce sur quoi les ordres passés s'étaient appuyés : le
 * coût estimé d'un ordre de janvier changeait en mars, et l'écart entre estimé
 * et réel finissait par mesurer l'ancienneté de la fiche plutôt que la
 * performance de l'atelier. Le champ `version` de la nomenclature existait,
 * mais rien ne s'en servait.
 *
 * Une copie plutôt qu'une référence versionnée : c'est le même arbitrage que
 * pour `unitCost` sur les lignes de facture. Ce qui est parti en production ne
 * bouge plus.
 */
@Index('IDX_production_order_lines_tenantId', ['tenantId'])
@Index('IDX_production_order_lines_orderId', ['productionOrderId'])
@Index('IDX_production_order_lines_rawMaterialId', ['rawMaterialId'])
@Entity('production_order_lines')
export class ProductionOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  productionOrderId: string;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'int', default: 1 })
  order: number;

  /** Quantité pour **une** unité produite, telle qu'elle était au démarrage. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityPerUnit: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  /** Coût unitaire de la matière au démarrage — il ne suit plus le catalogue. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  unitCost: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineCost: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => ProductionOrder, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productionOrderId' })
  productionOrder: ProductionOrder;
}
