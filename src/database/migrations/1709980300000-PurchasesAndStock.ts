import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchasesAndStock1709980300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Purchase Orders ---
    await queryRunner.query(`CREATE TYPE "po_status_enum" AS ENUM ('draft', 'sent', 'received', 'cancelled')`);
    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id"                   uuid            NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"             uuid            NOT NULL,
        "poNumber"             varchar(20)     NOT NULL,
        "supplierId"           uuid            NOT NULL,
        "status"               "po_status_enum" NOT NULL DEFAULT 'draft',
        "orderDate"            date            NOT NULL,
        "expectedDeliveryDate" date,
        "subtotal"             decimal(12,2)   NOT NULL DEFAULT 0,
        "taxAmount"            decimal(12,2)   NOT NULL DEFAULT 0,
        "total"                decimal(12,2)   NOT NULL DEFAULT 0,
        "notes"                text,
        "createdBy"            varchar,
        "updatedBy"            varchar,
        "createdAt"            timestamptz     NOT NULL DEFAULT now(),
        "updatedAt"            timestamptz     NOT NULL DEFAULT now(),
        "deletedAt"            timestamptz,
        CONSTRAINT "PK_purchase_orders"                   PRIMARY KEY ("id"),
        CONSTRAINT "UQ_purchase_orders_po_number_tenant"  UNIQUE ("poNumber", "tenantId"),
        CONSTRAINT "FK_purchase_orders_tenant"            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_purchase_orders_supplier"          FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_tenant_id"   ON "purchase_orders" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_supplier_id" ON "purchase_orders" ("supplierId")`);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_status"      ON "purchase_orders" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_order_date"  ON "purchase_orders" ("orderDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_purchase_orders_deleted_at"  ON "purchase_orders" ("deletedAt")`);

    // --- Purchase Order Items ---
    await queryRunner.query(`
      CREATE TABLE "purchase_order_items" (
        "id"               uuid          NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"         uuid          NOT NULL,
        "purchaseOrderId"  uuid          NOT NULL,
        "rawMaterialId"    uuid          NOT NULL,
        "quantity"         decimal(10,2) NOT NULL,
        "unit"             varchar(50)   NOT NULL,
        "unitPrice"        decimal(10,2) NOT NULL,
        "lineTotal"        decimal(12,2) NOT NULL,
        "createdAt"        timestamptz   NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_order_items"           PRIMARY KEY ("id"),
        CONSTRAINT "FK_po_items_purchase_order"        FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_po_items_raw_material"          FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id"),
        CONSTRAINT "FK_po_items_tenant"                FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_po_items_purchase_order_id" ON "purchase_order_items" ("purchaseOrderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_po_items_tenant_id"         ON "purchase_order_items" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_po_items_raw_material_id"   ON "purchase_order_items" ("rawMaterialId")`);

    // --- Reception BLs ---
    await queryRunner.query(`CREATE TYPE "reception_bl_status_enum" AS ENUM ('pending', 'partial', 'completed')`);
    await queryRunner.query(`
      CREATE TABLE "reception_bls" (
        "id"                     uuid                       NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"               uuid                       NOT NULL,
        "blNumber"               varchar(30)                NOT NULL,
        "purchaseOrderId"        uuid                       NOT NULL,
        "receptionDate"          date                       NOT NULL,
        "status"                 "reception_bl_status_enum" NOT NULL DEFAULT 'pending',
        "totalQuantityReceived"  decimal(10,2)              NOT NULL DEFAULT 0,
        "notes"                  text,
        "createdBy"              varchar,
        "updatedBy"              varchar,
        "createdAt"              timestamptz                NOT NULL DEFAULT now(),
        "updatedAt"              timestamptz                NOT NULL DEFAULT now(),
        "deletedAt"              timestamptz,
        CONSTRAINT "PK_reception_bls"                     PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reception_bls_bl_number_tenant"    UNIQUE ("blNumber", "tenantId"),
        CONSTRAINT "FK_reception_bls_tenant"              FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reception_bls_purchase_order"      FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reception_bls_tenant_id"         ON "reception_bls" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_reception_bls_purchase_order_id" ON "reception_bls" ("purchaseOrderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_reception_bls_status"            ON "reception_bls" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_reception_bls_deleted_at"        ON "reception_bls" ("deletedAt")`);

    // --- Stock Entries ---
    await queryRunner.query(`CREATE TYPE "stock_entry_status_enum" AS ENUM ('available', 'reserved', 'sold', 'adjusted')`);
    await queryRunner.query(`
      CREATE TABLE "stock_entries" (
        "id"            uuid                      NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"      uuid                      NOT NULL,
        "rawMaterialId" uuid                      NOT NULL,
        "receptionBlId" uuid,
        "quantity"      decimal(10,2)             NOT NULL,
        "costPerUnit"   decimal(10,2)             NOT NULL,
        "totalCost"     decimal(12,2)             NOT NULL,
        "batchNumber"   varchar(100),
        "expiresAt"     timestamptz,
        "status"        "stock_entry_status_enum" NOT NULL DEFAULT 'available',
        "enteredAt"     timestamptz               NOT NULL,
        "createdBy"     varchar,
        "createdAt"     timestamptz               NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_entries"              PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_entries_tenant"       FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_entries_raw_material" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id"),
        CONSTRAINT "FK_stock_entries_reception_bl" FOREIGN KEY ("receptionBlId") REFERENCES "reception_bls"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_stock_entries_tenant_id"       ON "stock_entries" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_stock_entries_raw_material_id" ON "stock_entries" ("rawMaterialId")`);
    await queryRunner.query(`CREATE INDEX "IDX_stock_entries_status"          ON "stock_entries" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_stock_entries_entered_at"      ON "stock_entries" ("enteredAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_stock_entries_expires_at"      ON "stock_entries" ("expiresAt")`);

    // --- Inventory Summary ---
    await queryRunner.query(`
      CREATE TABLE "inventory_summary" (
        "id"                     uuid          NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"               uuid          NOT NULL,
        "rawMaterialId"          uuid          NOT NULL,
        "totalQuantity"          decimal(10,2) NOT NULL DEFAULT 0,
        "averageCostPerUnit"     decimal(10,2) NOT NULL DEFAULT 0,
        "totalValue"             decimal(12,2) NOT NULL DEFAULT 0,
        "earliestExpirationDate" timestamptz,
        "updatedAt"              timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_summary"              PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_summary_mat_tenant"   UNIQUE ("rawMaterialId", "tenantId"),
        CONSTRAINT "FK_inventory_summary_tenant"       FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inventory_summary_raw_material" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_summary_tenant_id"       ON "inventory_summary" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_summary_raw_material_id" ON "inventory_summary" ("rawMaterialId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_summary"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stock_entry_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reception_bls"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reception_bl_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "po_status_enum"`);
  }
}
