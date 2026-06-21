import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaxRateToPoItems1750005000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items"
        ADD COLUMN IF NOT EXISTS "taxRate"   decimal(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "taxAmount" decimal(12,2) NOT NULL DEFAULT 0`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_items"
        DROP COLUMN IF EXISTS "taxRate",
        DROP COLUMN IF EXISTS "taxAmount"`,
    );
  }
}
