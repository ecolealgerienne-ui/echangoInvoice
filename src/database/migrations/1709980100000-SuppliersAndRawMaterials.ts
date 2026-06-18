import { MigrationInterface, QueryRunner } from 'typeorm';

export class SuppliersAndRawMaterials1709980100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Suppliers ---
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id"            uuid         NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"      uuid         NOT NULL,
        "name"          varchar(255) NOT NULL,
        "contactPerson" varchar(255),
        "email"         varchar(255),
        "phone"         varchar(50),
        "address"       text,
        "city"          varchar(100),
        "country"       varchar(100),
        "notes"         text,
        "createdBy"     varchar,
        "updatedBy"     varchar,
        "createdAt"     timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"     timestamptz,
        CONSTRAINT "PK_suppliers"        PRIMARY KEY ("id"),
        CONSTRAINT "FK_suppliers_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_suppliers_tenant_id"  ON "suppliers" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_suppliers_deleted_at" ON "suppliers" ("deletedAt")`);

    // --- Raw Materials ---
    await queryRunner.query(`
      CREATE TABLE "raw_materials" (
        "id"               uuid           NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"         uuid           NOT NULL,
        "name"             varchar(255)   NOT NULL,
        "code"             varchar(100),
        "unit"             varchar(50)    NOT NULL,
        "lastCostPerUnit"  decimal(10,2)  NOT NULL DEFAULT 0,
        "supplierId"       uuid,
        "description"      text,
        "isActive"         boolean        NOT NULL DEFAULT true,
        "createdBy"        varchar,
        "updatedBy"        varchar,
        "createdAt"        timestamptz    NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz    NOT NULL DEFAULT now(),
        "deletedAt"        timestamptz,
        CONSTRAINT "PK_raw_materials"           PRIMARY KEY ("id"),
        CONSTRAINT "FK_raw_materials_tenant"    FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_raw_materials_supplier"  FOREIGN KEY ("supplierId")
          REFERENCES "suppliers"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_raw_materials_tenant_id"   ON "raw_materials" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_raw_materials_supplier_id" ON "raw_materials" ("supplierId")`);
    await queryRunner.query(`CREATE INDEX "IDX_raw_materials_is_active"   ON "raw_materials" ("isActive")`);
    await queryRunner.query(`CREATE INDEX "IDX_raw_materials_deleted_at"  ON "raw_materials" ("deletedAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "raw_materials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
  }
}
