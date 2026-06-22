import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservedQuantityToRawMaterials1750009000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "finished_products"
        ADD COLUMN IF NOT EXISTS "reservedQuantity" decimal(10,2) NOT NULL DEFAULT 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "finished_products" DROP COLUMN IF EXISTS "reservedQuantity"
    `);
  }
}
