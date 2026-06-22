import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Nomenclature } from './nomenclature.entity';

@Index('IDX_bom_lines_tenantId', ['tenantId'])
@Index('IDX_bom_lines_nomenclatureId', ['nomenclatureId'])
@Index('IDX_bom_lines_rawMaterialId', ['rawMaterialId'])
@Entity('bom_lines')
export class BomLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  nomenclatureId: string;

  @Column({ type: 'int', default: 1 })
  order: number;

  @Column({ type: 'uuid' })
  rawMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantityPerUnit: number;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  unitCost: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  lineCost: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Nomenclature, (n) => n.bomLines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nomenclatureId' })
  nomenclature: Nomenclature;
}
