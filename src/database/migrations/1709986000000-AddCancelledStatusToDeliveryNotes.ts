import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCancelledStatusToDeliveryNotes1709986000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "delivery_notes_status_enum" ADD VALUE IF NOT EXISTS 'cancelled'`,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values; intentionally left as no-op
  }
}
