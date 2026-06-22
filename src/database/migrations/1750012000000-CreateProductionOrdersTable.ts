import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductionOrdersTable1750012000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_orders" (
        "id"                  uuid            NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"            uuid            NOT NULL,
        "reference"           varchar(50)     NOT NULL,
        "nomenclatureId"      uuid            NOT NULL,
        "finishedProductId"   uuid            NOT NULL,
        "status"              varchar(20)     NOT NULL DEFAULT 'draft',
        "priority"            varchar(20)     NOT NULL DEFAULT 'normal',
        "quantityOrdered"     decimal(10,2)   NOT NULL,
        "quantityProduced"    decimal(10,2)   NOT NULL DEFAULT 0,
        "scheduledStartDate"  timestamptz     NULL,
        "scheduledEndDate"    timestamptz     NULL,
        "actualStartDate"     timestamptz     NULL,
        "actualEndDate"       timestamptz     NULL,
        "notes"               text,
        "createdBy"           varchar         NULL,
        "updatedBy"           varchar         NULL,
        "createdAt"           timestamptz     NOT NULL DEFAULT now(),
        "updatedAt"           timestamptz     NOT NULL DEFAULT now(),
        "deletedAt"           timestamptz     NULL,
        CONSTRAINT "PK_production_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_production_orders_reference_tenantId" UNIQUE ("reference", "tenantId"),
        CONSTRAINT "FK_production_orders_nomenclature"
          FOREIGN KEY ("nomenclatureId") REFERENCES "nomenclatures"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_production_orders_finishedProduct"
          FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_production_orders_tenantId" ON "production_orders" ("tenantId");
      CREATE INDEX "IDX_production_orders_status" ON "production_orders" ("status");
      CREATE INDEX "IDX_production_orders_nomenclatureId" ON "production_orders" ("nomenclatureId");
      CREATE INDEX "IDX_production_orders_finishedProductId" ON "production_orders" ("finishedProductId");
      CREATE INDEX "IDX_production_orders_deletedAt" ON "production_orders" ("deletedAt");
      CREATE INDEX "IDX_production_orders_scheduledStartDate" ON "production_orders" ("scheduledStartDate");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "production_orders"`);
  }
}
