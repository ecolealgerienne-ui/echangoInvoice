import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuperadminRole1750015000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'superadmin'`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenantId" DROP NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL`);
    // Note: PostgreSQL does not support removing enum values easily
  }
}
