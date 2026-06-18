import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Setting } from './setting.entity';

@Index('IDX_tax_rate_configs_tenantId', ['tenantId'])
@Index('IDX_tax_rate_configs_settingsId', ['settingsId'])
@Entity('tax_rate_configs')
export class TaxRateConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  settingsId: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  rate: number;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'varchar', length: 10, default: 'DA' })
  currency: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Setting, (s) => s.taxRates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settingsId' })
  settings: Setting;
}
