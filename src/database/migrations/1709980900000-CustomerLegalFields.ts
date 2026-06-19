import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerLegalFields1709980900000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        ADD COLUMN IF NOT EXISTS "nif" varchar(20),
        ADD COLUMN IF NOT EXISTS "rc"  varchar(20),
        ADD COLUMN IF NOT EXISTS "ai"  varchar(20),
        ADD COLUMN IF NOT EXISTS "nis" varchar(20)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        DROP COLUMN IF EXISTS "nif",
        DROP COLUMN IF EXISTS "rc",
        DROP COLUMN IF EXISTS "ai",
        DROP COLUMN IF EXISTS "nis"
    `);
  }
}
