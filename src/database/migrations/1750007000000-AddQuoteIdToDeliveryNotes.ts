import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuoteIdToDeliveryNotes1750007000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery_notes"
         ADD COLUMN IF NOT EXISTS "quoteId" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_notes_quote_id" ON "delivery_notes" ("quoteId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_delivery_notes_quote_id"`);
    await queryRunner.query(`ALTER TABLE "delivery_notes" DROP COLUMN IF EXISTS "quoteId"`);
  }
}
