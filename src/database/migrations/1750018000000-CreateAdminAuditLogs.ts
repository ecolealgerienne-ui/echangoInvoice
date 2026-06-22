import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminAuditLogs1750018000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "adminId" varchar(255) NOT NULL,
        "adminEmail" varchar(255) NOT NULL,
        "action" varchar(100) NOT NULL,
        "targetType" varchar(50) NOT NULL,
        "targetId" varchar(255) NOT NULL,
        "metadata" jsonb,
        "ipAddress" inet,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_admin_audit_logs_admin_id" ON "admin_audit_logs" ("adminId")`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_audit_logs_target_id" ON "admin_audit_logs" ("targetId")`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_audit_logs_action" ON "admin_audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_audit_logs_created_at" ON "admin_audit_logs" ("createdAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
  }
}
