import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSaasPayments1750019000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE saas_payment_method_enum AS ENUM ('bank_transfer', 'cash', 'check', 'ccp')
    `);
    await queryRunner.query(`
      CREATE TABLE "saas_payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "amount" decimal(10,2) NOT NULL,
        "method" saas_payment_method_enum NOT NULL DEFAULT 'bank_transfer',
        "reference" varchar(255),
        "paidAt" timestamptz NOT NULL,
        "monthsCovered" int NOT NULL DEFAULT 1,
        "notes" text,
        "createdBy" varchar(255) NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_saas_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_saas_payments_tenant_id" ON "saas_payments" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_saas_payments_paid_at" ON "saas_payments" ("paidAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "saas_payments"`);
    await queryRunner.query(`DROP TYPE saas_payment_method_enum`);
  }
}
