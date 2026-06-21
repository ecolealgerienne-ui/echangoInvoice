import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversionLinks1709985000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "convertedToDeliveryNoteId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_notes" ADD COLUMN IF NOT EXISTS "convertedToInvoiceId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quotes_converted_bl"
       ON "quotes" ("convertedToDeliveryNoteId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_notes_converted_invoice"
       ON "delivery_notes" ("convertedToInvoiceId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_delivery_notes_converted_invoice"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quotes_converted_bl"`);
    await queryRunner.query(
      `ALTER TABLE "delivery_notes" DROP COLUMN IF EXISTS "convertedToInvoiceId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" DROP COLUMN IF EXISTS "convertedToDeliveryNoteId"`,
    );
  }
}
