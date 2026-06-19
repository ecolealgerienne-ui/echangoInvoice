import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, Index,
} from 'typeorm';
import { TaxRateConfig } from './tax-rate-config.entity';

@Index('IDX_settings_tenantId', ['tenantId'])
@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  tenantId: string;

  @Column({ type: 'varchar', length: 255, default: 'Mon Entreprise' })
  companyName: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 19 })
  taxRate: number;

  @Column({ type: 'varchar', length: 10, default: 'DA' })
  currency: string;

  @Column({ type: 'varchar', length: 30, default: 'BL-YY-###' })
  blNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'FAC-YY-###' })
  invoiceNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'DEV-YY-###' })
  quoteNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'PO-YY-###' })
  poNumberFormat: string;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  footerText: string | null;

  @Column({ type: 'simple-array', nullable: true })
  units: string[];

  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => TaxRateConfig, (tc) => tc.settings, { cascade: true, eager: true })
  taxRates: TaxRateConfig[];
}
