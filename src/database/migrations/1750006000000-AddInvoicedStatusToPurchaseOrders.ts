import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoicedStatusToPurchaseOrders1750006000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Check if the status column uses a native enum type or varchar
    const [row] = await queryRunner.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'purchase_orders' AND column_name = 'status'
    `);

    if (row?.data_type === 'USER-DEFINED') {
      // Native PostgreSQL enum — add the new value
      await queryRunner.query(
        `ALTER TYPE "${row.udt_name}" ADD VALUE IF NOT EXISTS 'invoiced'`,
      );
    }
    // If varchar, no schema change needed — the entity type annotation is enough
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values
  }
}
