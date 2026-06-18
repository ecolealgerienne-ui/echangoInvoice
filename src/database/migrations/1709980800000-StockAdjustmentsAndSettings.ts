import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockAdjustmentsAndSettings1709980800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // alertThreshold on inventory_summary (used by dashboard low-stock alerts)
    await queryRunner.query(`
      ALTER TABLE "inventory_summary"
        ADD COLUMN IF NOT EXISTS "alertThreshold" decimal(10,2)
    `);

    // stock_adjustments — audit trail for manual adjustments
    await queryRunner.query(`
      CREATE TYPE stock_adjustment_reason_enum AS ENUM (
        'loss', 'breakage', 'physical_count', 'correction', 'other'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "stock_adjustments" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"            uuid NOT NULL,
        "rawMaterialId"       uuid NOT NULL,
        "stockEntryId"        uuid NOT NULL,
        "quantityAdjustment"  decimal(10,2) NOT NULL,
        "reason"              stock_adjustment_reason_enum NOT NULL,
        "notes"               text,
        "adjustedBy"          varchar(255),
        "adjustedAt"          timestamptz NOT NULL DEFAULT now(),
        "createdAt"           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_stock_adj_tenantId"      ON stock_adjustments ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_stock_adj_rawMaterialId" ON stock_adjustments ("rawMaterialId")`);
    await queryRunner.query(`CREATE INDEX "IDX_stock_adj_adjustedAt"    ON stock_adjustments ("adjustedAt")`);

    // settings table
    await queryRunner.query(`
      CREATE TABLE "settings" (
        "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"            uuid NOT NULL UNIQUE,
        "companyName"         varchar(255) NOT NULL DEFAULT 'Mon Entreprise',
        "taxRate"             decimal(5,2) NOT NULL DEFAULT 19,
        "currency"            varchar(10) NOT NULL DEFAULT 'DA',
        "blNumberFormat"      varchar(30) NOT NULL DEFAULT 'BL-YY-###',
        "invoiceNumberFormat" varchar(30) NOT NULL DEFAULT 'FAC-YY-###',
        "quoteNumberFormat"   varchar(30) NOT NULL DEFAULT 'DEV-YY-###',
        "poNumberFormat"      varchar(30) NOT NULL DEFAULT 'PO-YY-###',
        "logo"                text,
        "email"               varchar(255),
        "phone"               varchar(50),
        "address"             text,
        "footerText"          text,
        "updatedBy"           varchar(255),
        "createdAt"           timestamptz NOT NULL DEFAULT now(),
        "updatedAt"           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_settings_tenantId" ON settings ("tenantId")`);

    // tax_rate_configs table
    await queryRunner.query(`
      CREATE TABLE "tax_rate_configs" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"   uuid NOT NULL,
        "settingsId" uuid NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
        "name"       varchar(50) NOT NULL,
        "rate"       decimal(5,2) NOT NULL,
        "isDefault"  boolean NOT NULL DEFAULT false,
        "currency"   varchar(10) NOT NULL DEFAULT 'DA',
        "createdAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tax_rate_configs_tenantId"   ON tax_rate_configs ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_tax_rate_configs_settingsId" ON tax_rate_configs ("settingsId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tax_rate_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_adjustments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS stock_adjustment_reason_enum`);
    await queryRunner.query(`ALTER TABLE "inventory_summary" DROP COLUMN IF EXISTS "alertThreshold"`);
  }
}
