import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeRefreshTokenTenantIdNullable1750020000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE refresh_tokens ALTER COLUMN "tenantId" DROP NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Delete superadmin tokens before restoring constraint
    await queryRunner.query(
      `DELETE FROM refresh_tokens WHERE "tenantId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE refresh_tokens ALTER COLUMN "tenantId" SET NOT NULL`,
    );
  }
}
