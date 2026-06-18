import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1709980000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Tenants ---
    await queryRunner.query(`
      CREATE TYPE "tenant_status_enum" AS ENUM ('trial', 'active', 'suspended')
    `);
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"         uuid                NOT NULL DEFAULT gen_random_uuid(),
        "name"       varchar(255)        NOT NULL,
        "slug"       varchar(100)        NOT NULL,
        "email"      varchar(255)        NOT NULL,
        "phone"      varchar(50),
        "address"    text,
        "logo"       varchar,
        "status"     "tenant_status_enum" NOT NULL DEFAULT 'trial',
        "createdAt"  timestamptz         NOT NULL DEFAULT now(),
        "updatedAt"  timestamptz         NOT NULL DEFAULT now(),
        "deletedAt"  timestamptz,
        CONSTRAINT "PK_tenants"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenants_slug"  UNIQUE ("slug"),
        CONSTRAINT "UQ_tenants_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_tenants_status"     ON "tenants" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_tenants_deleted_at" ON "tenants" ("deletedAt")`);

    // --- Subscriptions ---
    await queryRunner.query(`CREATE TYPE "subscription_plan_enum"   AS ENUM ('freemium', 'pro')`);
    await queryRunner.query(`CREATE TYPE "subscription_status_enum" AS ENUM ('active', 'expired', 'cancelled')`);
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id"                 uuid                        NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"           uuid                        NOT NULL,
        "plan"               "subscription_plan_enum"    NOT NULL DEFAULT 'freemium',
        "status"             "subscription_status_enum"  NOT NULL DEFAULT 'active',
        "invoicesThisMonth"  int                         NOT NULL DEFAULT 0,
        "invoiceLimit"       int,
        "usersCount"         int                         NOT NULL DEFAULT 1,
        "usersLimit"         int,
        "pricePerMonth"      decimal(10,2),
        "renewalDate"        timestamptz,
        "createdAt"          timestamptz                 NOT NULL DEFAULT now(),
        "updatedAt"          timestamptz                 NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions"        PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_subscriptions_tenant_id" ON "subscriptions" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_subscriptions_status"    ON "subscriptions" ("status")`);

    // --- Users ---
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('owner', 'manager', 'agent')`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"           uuid              NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"     uuid              NOT NULL,
        "email"        varchar(255)      NOT NULL,
        "passwordHash" varchar(255)      NOT NULL,
        "name"         varchar(255)      NOT NULL,
        "role"         "user_role_enum"  NOT NULL DEFAULT 'agent',
        "isActive"     boolean           NOT NULL DEFAULT true,
        "createdBy"    varchar,
        "updatedBy"    varchar,
        "createdAt"    timestamptz       NOT NULL DEFAULT now(),
        "updatedAt"    timestamptz       NOT NULL DEFAULT now(),
        "deletedAt"    timestamptz,
        CONSTRAINT "PK_users"        PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email"  UNIQUE ("email"),
        CONSTRAINT "FK_users_tenant" FOREIGN KEY ("tenantId")
          REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_tenant_id"  ON "users" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_email"      ON "users" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_role"       ON "users" ("role")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_deleted_at" ON "users" ("deletedAt")`);

    // --- Refresh Tokens ---
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"         uuid         NOT NULL DEFAULT gen_random_uuid(),
        "userId"     uuid         NOT NULL,
        "tenantId"   uuid         NOT NULL,
        "tokenHash"  varchar(255) NOT NULL,
        "revoked"    boolean      NOT NULL DEFAULT false,
        "expiresAt"  timestamptz  NOT NULL,
        "createdAt"  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens"        PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user"   FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_user_id"    ON "refresh_tokens" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_revoked"    ON "refresh_tokens" ("revoked")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expiresAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_plan_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenant_status_enum"`);
  }
}
