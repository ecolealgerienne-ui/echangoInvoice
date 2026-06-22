import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionModuleFlag1750008000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "settings"
        ADD COLUMN IF NOT EXISTS "productionModuleEnabled" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "settings" DROP COLUMN IF EXISTS "productionModuleEnabled"
    `);
  }
}
