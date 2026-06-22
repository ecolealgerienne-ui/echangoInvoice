import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropOutputQuantityFromNomenclatures1750014000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nomenclatures" DROP COLUMN IF EXISTS "outputQuantity"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nomenclatures" ADD COLUMN IF NOT EXISTS "outputQuantity" decimal(10,2) NOT NULL DEFAULT 1`,
    );
  }
}
