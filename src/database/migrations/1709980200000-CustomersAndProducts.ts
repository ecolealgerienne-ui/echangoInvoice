import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomersAndProducts1709980200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Customers ---
    await queryRunner.query(`
      CREATE TABLE "customers" (
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
        "isActive"      boolean      NOT NULL DEFAULT true,
        "createdBy"     varchar,
        "updatedBy"     varchar,
        "createdAt"     timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz  NOT NULL DEFAULT now(),
        "deletedAt"     timestamptz,
        CONSTRAINT "PK_customers"        PRIMARY KEY ("id"),
        CONSTRAINT "FK_customers_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_customers_tenant_id"  ON "customers" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_customers_email"      ON "customers" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_customers_is_active"  ON "customers" ("isActive")`);
    await queryRunner.query(`CREATE INDEX "IDX_customers_deleted_at" ON "customers" ("deletedAt")`);

    // --- Finished Products ---
    await queryRunner.query(`
      CREATE TABLE "finished_products" (
        "id"                 uuid           NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"           uuid           NOT NULL,
        "name"               varchar(255)   NOT NULL,
        "code"               varchar(100)   NOT NULL,
        "unit"               varchar(50)    NOT NULL,
        "defaultSalesPrice"  decimal(10,2)  NOT NULL,
        "description"        text,
        "isActive"           boolean        NOT NULL DEFAULT true,
        "createdBy"          varchar,
        "updatedBy"          varchar,
        "createdAt"          timestamptz    NOT NULL DEFAULT now(),
        "updatedAt"          timestamptz    NOT NULL DEFAULT now(),
        "deletedAt"          timestamptz,
        CONSTRAINT "PK_finished_products"               PRIMARY KEY ("id"),
        CONSTRAINT "UQ_finished_products_code_tenant"   UNIQUE ("code", "tenantId"),
        CONSTRAINT "FK_finished_products_tenant"        FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_finished_products_tenant_id"  ON "finished_products" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_finished_products_is_active"  ON "finished_products" ("isActive")`);
    await queryRunner.query(`CREATE INDEX "IDX_finished_products_deleted_at" ON "finished_products" ("deletedAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "finished_products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
  }
}
