import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerShippingAddress1709981200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        ADD COLUMN IF NOT EXISTS "shippingAddress" text,
        ADD COLUMN IF NOT EXISTS "shippingCity"    varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
        DROP COLUMN IF EXISTS "shippingAddress",
        DROP COLUMN IF EXISTS "shippingCity"
    `);
  }
}
