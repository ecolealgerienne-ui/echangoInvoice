import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveStockToProduct1750000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add stock columns to finished_products
    await queryRunner.query(`
      ALTER TABLE finished_products
        ADD COLUMN IF NOT EXISTS "stockQuantity"          decimal(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "averageCostPerUnit"     decimal(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "totalStockValue"        decimal(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "earliestExpirationDate" timestamptz,
        ADD COLUMN IF NOT EXISTS "alertThreshold"         decimal(10,2)
    `);

    // 2. Migrate existing data from inventory_summary
    await queryRunner.query(`
      UPDATE finished_products fp
      SET "stockQuantity"          = inv."totalQuantity",
          "averageCostPerUnit"     = inv."averageCostPerUnit",
          "totalStockValue"        = inv."totalValue",
          "earliestExpirationDate" = inv."earliestExpirationDate",
          "alertThreshold"         = inv."alertThreshold"
      FROM inventory_summary inv
      WHERE inv."rawMaterialId" = fp.id
        AND inv."tenantId"      = fp."tenantId"
    `);

    // 3. Drop inventory_summary
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_summary`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate inventory_summary and restore data
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS inventory_summary (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"               uuid NOT NULL,
        "rawMaterialId"          uuid NOT NULL,
        "totalQuantity"          decimal(10,2) NOT NULL DEFAULT 0,
        "averageCostPerUnit"     decimal(10,2) NOT NULL DEFAULT 0,
        "totalValue"             decimal(12,2) NOT NULL DEFAULT 0,
        "earliestExpirationDate" timestamptz,
        "alertThreshold"         decimal(10,2),
        "updatedAt"              timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO inventory_summary
        ("tenantId","rawMaterialId","totalQuantity","averageCostPerUnit","totalValue","earliestExpirationDate","alertThreshold")
      SELECT "tenantId", id, "stockQuantity", "averageCostPerUnit", "totalStockValue", "earliestExpirationDate", "alertThreshold"
      FROM finished_products
      WHERE "stockQuantity" > 0 OR "alertThreshold" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE finished_products
        DROP COLUMN IF EXISTS "stockQuantity",
        DROP COLUMN IF EXISTS "averageCostPerUnit",
        DROP COLUMN IF EXISTS "totalStockValue",
        DROP COLUMN IF EXISTS "earliestExpirationDate",
        DROP COLUMN IF EXISTS "alertThreshold"
    `);
  }
}
