import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingStockColumns1709981500000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // deletedAt manquant sur stock_entries (entité a @DeleteDateColumn mais la migration ne l'avait pas créée)
    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz
    `);

    // reservedByDeliveryNoteId et finishedProductId ajoutés par MergeRawMaterials mais au cas où
    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        ADD COLUMN IF NOT EXISTS "finishedProductId" uuid,
        ADD COLUMN IF NOT EXISTS "reservedByDeliveryNoteId" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_entries_deleted_at"
        ON "stock_entries" ("deletedAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_entries_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "stock_entries" DROP COLUMN IF EXISTS "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "stock_entries" DROP COLUMN IF EXISTS "finishedProductId"`);
    await queryRunner.query(`ALTER TABLE "stock_entries" DROP COLUMN IF EXISTS "reservedByDeliveryNoteId"`);
  }
}
