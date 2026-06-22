import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBomLinesTable1750011000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bom_lines" (
        "id"              uuid            NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"        uuid            NOT NULL,
        "nomenclatureId"  uuid            NOT NULL,
        "order"           int             NOT NULL DEFAULT 1,
        "rawMaterialId"   uuid            NOT NULL,
        "quantityPerUnit" decimal(10,2)   NOT NULL,
        "unit"            varchar(50)     NOT NULL,
        "unitCost"        decimal(10,2)   NOT NULL DEFAULT 0,
        "lineCost"        decimal(12,2)   NOT NULL DEFAULT 0,
        "createdAt"       timestamptz     NOT NULL DEFAULT now(),
        "updatedAt"       timestamptz     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bom_lines_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bom_lines_nomenclature"
          FOREIGN KEY ("nomenclatureId") REFERENCES "nomenclatures"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bom_lines_rawMaterial"
          FOREIGN KEY ("rawMaterialId") REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bom_lines_tenantId"        ON "bom_lines" ("tenantId");
      CREATE INDEX "IDX_bom_lines_nomenclatureId"  ON "bom_lines" ("nomenclatureId");
      CREATE INDEX "IDX_bom_lines_rawMaterialId"   ON "bom_lines" ("rawMaterialId");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bom_lines"`);
  }
}
