import { MigrationInterface, QueryRunner } from 'typeorm';

export class Invitations1709981100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invitations" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL,
        "email"       varchar(255) NOT NULL,
        "role"        varchar(20) NOT NULL DEFAULT 'agent',
        "token"       varchar(128) NOT NULL UNIQUE,
        "expiresAt"   timestamptz NOT NULL,
        "acceptedAt"  timestamptz,
        "createdBy"   varchar,
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invitations_tenant_id" ON "invitations" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_invitations_token" ON "invitations" ("token")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
  }
}
