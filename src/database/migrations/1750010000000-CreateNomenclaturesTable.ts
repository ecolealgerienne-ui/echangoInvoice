import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNomenclaturesTable1750010000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "nomenclatures" (
        "id"                    uuid            NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"              uuid            NOT NULL,
        "code"                  varchar(50)     NULL,
        "name"                  varchar(255)    NOT NULL,
        "description"           text            NULL,
        "finishedProductId"     uuid            NOT NULL,
        "outputQuantity"        decimal(10,2)   NOT NULL DEFAULT 1,
        "version"               int             NOT NULL DEFAULT 1,
        "status"                varchar(20)     NOT NULL DEFAULT 'active',
        "estimatedCostPerUnit"  decimal(12,2)   NOT NULL DEFAULT 0,
        "createdBy"             varchar         NULL,
        "updatedBy"             varchar         NULL,
        "createdAt"             timestamptz     NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz     NOT NULL DEFAULT now(),
        "deletedAt"             timestamptz     NULL,
        CONSTRAINT "PK_nomenclatures_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_nomenclatures_code_tenantId" UNIQUE ("code", "tenantId"),
        CONSTRAINT "FK_nomenclatures_finishedProduct"
          FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_nomenclatures_tenantId"         ON "nomenclatures" ("tenantId");
      CREATE INDEX "IDX_nomenclatures_finishedProductId" ON "nomenclatures" ("finishedProductId");
      CREATE INDEX "IDX_nomenclatures_status"           ON "nomenclatures" ("status");
      CREATE INDEX "IDX_nomenclatures_deletedAt"        ON "nomenclatures" ("deletedAt");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "nomenclatures"`);
  }
}
