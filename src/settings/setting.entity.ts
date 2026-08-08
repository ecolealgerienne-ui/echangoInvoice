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

  // Quatre formats manquaient : leurs compteurs étaient codés en dur, si bien
  // que la page Numérotation ne réglait que la moitié des documents émis.
  @Column({ type: 'varchar', length: 30, default: 'BL-REC-YY-###' })
  receptionNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'FAC-ACH-YY-###' })
  vendorBillNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'AV-YY-###' })
  creditNoteNumberFormat: string;

  @Column({ type: 'varchar', length: 30, default: 'MO-YY-###' })
  productionOrderNumberFormat: string;

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

  // Identifiants légaux de l'ÉMETTEUR. Ils n'existaient nulle part : les PDF
  // sélectionnaient `NULL AS company_nif` et imprimaient un NIF vide.
  @Column({ type: 'varchar', length: 50, nullable: true })
  nif: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rc: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ai: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nis: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  rib: string | null;

  @Column({ type: 'varchar', length: 7, default: '#1e3a5f' })
  pdfAccentColor: string;

  @Column({ type: 'simple-array', nullable: true })
  units: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  defaultUnit: string | null;

  @Column({ type: 'int', default: 30 })
  defaultPaymentTermsDays: number;

  @Column({ type: 'boolean', default: false })
  productionModuleEnabled: boolean;

  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => TaxRateConfig, (tc) => tc.settings, { cascade: true, eager: true })
  taxRates: TaxRateConfig[];
}
