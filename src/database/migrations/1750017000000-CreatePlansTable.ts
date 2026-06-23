import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlansTable1750017000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(50) NOT NULL,
        "name" varchar(100) NOT NULL,
        "pricePerMonth" decimal(10,2) NOT NULL DEFAULT 0,
        "invoiceLimit" int,
        "usersLimit" int,
        "features" jsonb NOT NULL DEFAULT '{}',
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" int NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_plans_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "plans" ("slug", "name", "pricePerMonth", "invoiceLimit", "usersLimit", "features", "sortOrder") VALUES
        ('starter', 'Starter', 2000, 30, 3, '{"creditNotes": false, "vendorBills": false, "production": false}', 0),
        ('pro', 'Pro', 5000, NULL, 10, '{"creditNotes": true, "vendorBills": true, "production": true}', 1),
        ('enterprise', 'Enterprise', 10000, NULL, NULL, '{"creditNotes": true, "vendorBills": true, "production": true, "prioritySupport": true}', 2)
    `);

    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "planId" uuid REFERENCES "plans"("id")`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "customPricePerMonth" decimal(10,2)`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "currentPeriodStart" timestamptz`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" timestamptz`);
    await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "lastResetAt" timestamptz`);

    await queryRunner.query(`
      UPDATE subscriptions SET "planId" = (SELECT id FROM plans WHERE slug = plan::text)
      WHERE "planId" IS NULL
    `);

    await queryRunner.query(`CREATE INDEX "IDX_subscriptions_plan_id" ON "subscriptions" ("planId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subscriptions_plan_id"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "lastResetAt"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "currentPeriodEnd"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "currentPeriodStart"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "customPricePerMonth"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "planId"`);
    await queryRunner.query(`DROP TABLE "plans"`);
  }
}
