import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerContacts1709981300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_contacts" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL,
        "customerId"  uuid NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
        "name"        varchar(255) NOT NULL,
        "role"        varchar(100),
        "email"       varchar(255),
        "phone"       varchar(50),
        "isPrimary"   boolean NOT NULL DEFAULT false,
        "createdBy"   varchar,
        "updatedBy"   varchar,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now(),
        "deletedAt"   timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_customer_contacts_tenant_id"   ON "customer_contacts" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_customer_contacts_customer_id" ON "customer_contacts" ("customerId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_contacts"`);
  }
}
