import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSettingsDefaultUnitAndPaymentTerms1709984000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings"
       ADD COLUMN IF NOT EXISTS "defaultUnit" varchar(50),
       ADD COLUMN IF NOT EXISTS "defaultPaymentTermsDays" int NOT NULL DEFAULT 30`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings"
       DROP COLUMN IF EXISTS "defaultUnit",
       DROP COLUMN IF EXISTS "defaultPaymentTermsDays"`,
    );
  }
}
