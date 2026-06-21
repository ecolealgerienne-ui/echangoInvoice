import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoicedStatusToPurchaseOrders1750006000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "purchase_orders_status_enum" ADD VALUE IF NOT EXISTS 'invoiced'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values; leave as-is on rollback
  }
}
