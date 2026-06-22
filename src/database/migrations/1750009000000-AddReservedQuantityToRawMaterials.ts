import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservedQuantityToRawMaterials1750009000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "raw_materials"
        ADD COLUMN IF NOT EXISTS "reservedQuantity" decimal(10,2) NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "raw_materials" DROP COLUMN IF EXISTS "reservedQuantity"
    `);
  }
}
