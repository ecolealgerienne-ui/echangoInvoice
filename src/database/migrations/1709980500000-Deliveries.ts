import { MigrationInterface, QueryRunner } from 'typeorm';

export class Deliveries1709980500000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Étend stock_entries pour supporter les produits finis (FIFO sur livraisons)
    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        ADD COLUMN IF NOT EXISTS "finishedProductId" uuid,
        ADD COLUMN IF NOT EXISTS "reservedByDeliveryNoteId" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_entries_finished_product_id"
        ON "stock_entries" ("finishedProductId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_entries_reserved_by_dn"
        ON "stock_entries" ("reservedByDeliveryNoteId")
    `);

    // delivery_notes
    await queryRunner.query(`
      CREATE TYPE "delivery_notes_status_enum"
        AS ENUM ('draft', 'sent', 'signed', 'delivered')
    `);

    await queryRunner.query(`
      CREATE TABLE "delivery_notes" (
        "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "blNumber"          varchar(20) NOT NULL,
        "customerId"        uuid NOT NULL,
        "deliveryDate"      date NOT NULL,
        "status"            "delivery_notes_status_enum" NOT NULL DEFAULT 'draft',
        "subtotal"          decimal(12,2) NOT NULL DEFAULT 0,
        "taxAmount"         decimal(12,2) NOT NULL DEFAULT 0,
        "total"             decimal(12,2) NOT NULL DEFAULT 0,
        "customerSignature" text,
        "signedDate"        date,
        "notes"             text,
        "createdBy"         varchar,
        "updatedBy"         varchar,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        "deletedAt"         timestamptz,
        CONSTRAINT "PK_delivery_notes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_delivery_notes_bl_number_tenant" UNIQUE ("blNumber", "tenantId"),
        CONSTRAINT "FK_delivery_notes_customer" FOREIGN KEY ("customerId")
          REFERENCES "customers"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_delivery_notes_tenant_id"     ON "delivery_notes" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_delivery_notes_customer_id"   ON "delivery_notes" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_delivery_notes_status"        ON "delivery_notes" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_delivery_notes_delivery_date" ON "delivery_notes" ("deliveryDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_delivery_notes_deleted_at"    ON "delivery_notes" ("deletedAt")`);

    // delivery_note_items
    await queryRunner.query(`
      CREATE TABLE "delivery_note_items" (
        "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "deliveryNoteId"    uuid NOT NULL,
        "finishedProductId" uuid NOT NULL,
        "quantity"          decimal(10,2) NOT NULL,
        "unit"              varchar(50) NOT NULL,
        "unitPrice"         decimal(12,2) NOT NULL,
        "taxName1"          varchar(100),
        "taxRate1"          decimal(5,2),
        "taxAmount1"        decimal(12,2) NOT NULL DEFAULT 0,
        "taxName2"          varchar(100),
        "taxRate2"          decimal(5,2),
        "taxAmount2"        decimal(12,2) NOT NULL DEFAULT 0,
        "lineTaxTotal"      decimal(12,2) NOT NULL DEFAULT 0,
        "lineTotal"         decimal(12,2) NOT NULL,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_note_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_delivery_note_items_dn" FOREIGN KEY ("deliveryNoteId")
          REFERENCES "delivery_notes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_delivery_note_items_product" FOREIGN KEY ("finishedProductId")
          REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_delivery_note_items_delivery_note_id" ON "delivery_note_items" ("deliveryNoteId")`);
    await queryRunner.query(`CREATE INDEX "IDX_delivery_note_items_tenant_id"        ON "delivery_note_items" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_delivery_note_items_product_id"       ON "delivery_note_items" ("finishedProductId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_note_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_notes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "delivery_notes_status_enum"`);
    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        DROP COLUMN IF EXISTS "finishedProductId",
        DROP COLUMN IF EXISTS "reservedByDeliveryNoteId"
    `);
  }
}
