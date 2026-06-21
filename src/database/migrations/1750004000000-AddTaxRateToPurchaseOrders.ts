import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaxRateToPurchaseOrders1750004000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Remove mistakenly added global taxRate from purchase_orders
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "taxRate"`,
    );
    // Add per-item tax fields to purchase_order_items
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
