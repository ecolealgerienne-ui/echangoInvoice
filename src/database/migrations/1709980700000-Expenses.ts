import { MigrationInterface, QueryRunner } from 'typeorm';

export class Expenses1709980700000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE expenses_category_enum AS ENUM (
        'loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL,
        "expenseDate" date NOT NULL,
        "description" varchar(255) NOT NULL,
        "category"    expenses_category_enum NOT NULL,
        "amount"      decimal(12,2) NOT NULL,
        "notes"       text,
        "isApproved"  boolean NOT NULL DEFAULT false,
        "approvedBy"  varchar(255),
        "approvedAt"  timestamptz,
        "createdBy"   varchar(255),
        "updatedBy"   varchar(255),
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now(),
        "deletedAt"   timestamptz
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_expenses_tenantId"    ON expenses ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_category"    ON expenses ("category")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_expenseDate" ON expenses ("expenseDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_isApproved"  ON expenses ("isApproved")`);
    await queryRunner.query(`CREATE INDEX "IDX_expenses_deletedAt"   ON expenses ("deletedAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
    await queryRunner.query(`DROP TYPE IF EXISTS expenses_category_enum`);
  }
}
