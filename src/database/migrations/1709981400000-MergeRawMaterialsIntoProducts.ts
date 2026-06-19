import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeRawMaterialsIntoProducts1709981400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Flex up finished_products columns
    await queryRunner.query(`
      ALTER TABLE "finished_products"
        ADD COLUMN IF NOT EXISTS "type"             varchar(20)      NOT NULL DEFAULT 'product',
        ADD COLUMN IF NOT EXISTS "supplierId"       uuid,
        ADD COLUMN IF NOT EXISTS "lastCostPerUnit"  decimal(10,2)    NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`ALTER TABLE "finished_products" ALTER COLUMN "code" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "finished_products" ALTER COLUMN "defaultSalesPrice" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "finished_products" ALTER COLUMN "defaultSalesPrice" SET DEFAULT 0`);

    // 2. Copy raw_materials into finished_products (keep same UUIDs)
    await queryRunner.query(`
      INSERT INTO "finished_products"
        (id, "tenantId", name, code, unit, "defaultSalesPrice", "lastCostPerUnit",
         "supplierId", description, "isActive", "createdBy", "updatedBy",
         "createdAt", "updatedAt", "deletedAt", "type")
      SELECT
        id, "tenantId", name, code, unit, 0, "lastCostPerUnit",
        "supplierId", description, "isActive", "createdBy", "updatedBy",
        "createdAt", "updatedAt", "deletedAt", 'material'
      FROM "raw_materials"
      ON CONFLICT (id) DO NOTHING
    `);

    // 3. Re-point purchase_order_items FK → finished_products
    await queryRunner.query(`ALTER TABLE "purchase_order_items" DROP CONSTRAINT IF EXISTS "FK_po_items_raw_material"`);
    await queryRunner.query(`
      ALTER TABLE "purchase_order_items"
        ADD CONSTRAINT "FK_po_items_product"
        FOREIGN KEY ("rawMaterialId") REFERENCES "finished_products"(id)
    `);

    // 4. Re-point stock_entries FK → finished_products
    await queryRunner.query(`ALTER TABLE "stock_entries" DROP CONSTRAINT IF EXISTS "FK_stock_entries_raw_material"`);
    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        ADD CONSTRAINT "FK_stock_entries_product"
        FOREIGN KEY ("rawMaterialId") REFERENCES "finished_products"(id)
    `);

    // 5. Re-point inventory_summary FK → finished_products
    await queryRunner.query(`ALTER TABLE "inventory_summary" DROP CONSTRAINT IF EXISTS "FK_inventory_summary_raw_material"`);
    await queryRunner.query(`
      ALTER TABLE "inventory_summary"
        ADD CONSTRAINT "FK_inventory_summary_product"
        FOREIGN KEY ("rawMaterialId") REFERENCES "finished_products"(id)
    `);

    // 6. Re-point stock_adjustments FK → finished_products (if FK exists)
    await queryRunner.query(`ALTER TABLE "stock_adjustments" DROP CONSTRAINT IF EXISTS "FK_stock_adj_raw_material"`);

    // 7. Index on type
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_finished_products_type" ON "finished_products" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_finished_products_supplier_id" ON "finished_products" ("supplierId")`);

    // 8. Drop raw_materials table
    await queryRunner.query(`DROP TABLE IF EXISTS "raw_materials"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate raw_materials from finished_products where type='material'
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "raw_materials" (
        id uuid PRIMARY KEY,
        "tenantId" uuid NOT NULL,
        name varchar(255) NOT NULL,
        code varchar(100),
        unit varchar(50) NOT NULL,
        "lastCostPerUnit" decimal(10,2) NOT NULL DEFAULT 0,
        "supplierId" uuid,
        description text,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdBy" varchar,
        "updatedBy" varchar,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz
      )
    `);
    await queryRunner.query(`
      INSERT INTO "raw_materials"
      SELECT id,"tenantId",name,code,unit,"lastCostPerUnit","supplierId",
             description,"isActive","createdBy","updatedBy","createdAt","updatedAt","deletedAt"
      FROM "finished_products" WHERE type='material'
    `);
  }
}
