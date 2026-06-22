import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductionMovementsTable1750013000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_movements" (
        "id"                  uuid            NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"            uuid            NOT NULL,
        "productionOrderId"   uuid            NOT NULL,
        "rawMaterialId"       uuid            NULL,
        "finishedProductId"   uuid            NULL,
        "type"                varchar(30)     NOT NULL,
        "quantity"            decimal(10,2)   NOT NULL,
        "unit"                varchar(50)     NOT NULL,
        "notes"               text,
        "createdBy"           varchar         NULL,
        "createdAt"           timestamptz     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_production_movements_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_production_movements_order"
          FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_production_movements_rawMaterial"
          FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_production_movements_finishedProduct"
          FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_production_movements_tenantId" ON "production_movements" ("tenantId");
      CREATE INDEX "IDX_production_movements_productionOrderId" ON "production_movements" ("productionOrderId");
      CREATE INDEX "IDX_production_movements_rawMaterialId" ON "production_movements" ("rawMaterialId");
      CREATE INDEX "IDX_production_movements_type" ON "production_movements" ("type");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "production_movements"`);
  }
}
