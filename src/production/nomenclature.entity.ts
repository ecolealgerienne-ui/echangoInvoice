import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
  OneToMany, Index, Unique,
} from 'typeorm';
import { BomLine } from './bom-line.entity';

export type NomenclatureStatus = 'active' | 'inactive' | 'archived';

@Index('IDX_nomenclatures_tenantId', ['tenantId'])
@Index('IDX_nomenclatures_finishedProductId', ['finishedProductId'])
@Index('IDX_nomenclatures_status', ['status'])
@Unique('UQ_nomenclatures_code_tenantId', ['code', 'tenantId'])
@Entity('nomenclatures')
export class Nomenclature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid' })
  finishedProductId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  outputQuantity: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: NomenclatureStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  estimatedCostPerUnit: number;

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

  @OneToMany(() => BomLine, (bl) => bl.nomenclature, { cascade: true, eager: true })
  bomLines: BomLine[];
}
