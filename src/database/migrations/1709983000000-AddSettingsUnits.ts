import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSettingsUnits1709983000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "units" text`,
    );
    await queryRunner.query(
      `UPDATE "settings" SET "units" = 'kg,g,tonne,L,mL,pcs,m,m²,m³,boîte,palette,sac' WHERE "units" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN IF EXISTS "units"`,
    );
  }
}
