import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifyContacts1750002000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Create unified contacts table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contacts" (
        "id"              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"        UUID NOT NULL,
        "isCustomer"      BOOLEAN NOT NULL DEFAULT false,
        "isSupplier"      BOOLEAN NOT NULL DEFAULT false,
        "name"            VARCHAR(255) NOT NULL,
        "contactPerson"   VARCHAR(255),
        "email"           VARCHAR(255),
        "phone"           VARCHAR(50),
        "nif"             VARCHAR(20),
        "rc"              VARCHAR(20),
        "ai"              VARCHAR(20),
        "nis"             VARCHAR(20),
        "address"         TEXT,
        "city"            VARCHAR(100),
        "country"         VARCHAR(100),
        "shippingAddress" TEXT,
        "shippingCity"    VARCHAR(100),
        "notes"           TEXT,
        "isActive"        BOOLEAN NOT NULL DEFAULT true,
        "createdBy"       VARCHAR,
        "updatedBy"       VARCHAR,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deletedAt"       TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contacts_tenant_id" ON "contacts" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contacts_email" ON "contacts" ("email")`);

    // Migrate existing customers (keep same UUIDs)
    await queryRunner.query(`
      INSERT INTO "contacts" (
        id, "tenantId", "isCustomer", "isSupplier", name, "contactPerson", email, phone,
        nif, rc, ai, nis, address, city, country, "shippingAddress", "shippingCity",
        notes, "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      )
      SELECT
        id, "tenantId", true, false, name, "contactPerson", email, phone,
        nif, rc, ai, nis, address, city, country, "shippingAddress", "shippingCity",
        notes, "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      FROM customers
      ON CONFLICT (id) DO NOTHING
    `);

    // Migrate existing suppliers (keep same UUIDs, set isSupplier=true)
    await queryRunner.query(`
      INSERT INTO "contacts" (
        id, "tenantId", "isCustomer", "isSupplier", name, "contactPerson", email, phone,
        nif, rc, ai, nis, address, city, country,
        notes, "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      )
      SELECT
        id, "tenantId", false, true, name, "contactPerson", email, phone,
        null, null, null, null, address, city, country,
        notes, "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      FROM suppliers
      ON CONFLICT (id) DO UPDATE SET "isSupplier" = true
    `);

    // Create contact_contacts table (replaces customer_contacts)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_contacts" (
        "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenantId"   UUID NOT NULL,
        "contactId"  UUID NOT NULL REFERENCES "contacts"(id),
        "name"       VARCHAR(255) NOT NULL,
        "role"       VARCHAR(100),
        "email"      VARCHAR(255),
        "phone"      VARCHAR(50),
        "isPrimary"  BOOLEAN NOT NULL DEFAULT false,
        "createdBy"  VARCHAR,
        "updatedBy"  VARCHAR,
        "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deletedAt"  TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contact_contacts_tenant_id" ON "contact_contacts" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contact_contacts_contact_id" ON "contact_contacts" ("contactId")`);

    // Migrate customer_contacts → contact_contacts
    await queryRunner.query(`
      INSERT INTO "contact_contacts" (id, "tenantId", "contactId", name, role, email, phone, "isPrimary", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt")
      SELECT id, "tenantId", "customerId", name, role, email, phone, "isPrimary", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      FROM customer_contacts
      ON CONFLICT (id) DO NOTHING
    `);

    // Drop FK constraints pointing to customers and suppliers (dynamic to handle TypeORM-generated names)
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT tc.constraint_name, tc.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
          JOIN information_schema.table_constraints tc2 ON rc.unique_constraint_name = tc2.constraint_name
          WHERE tc2.table_name IN ('customers', 'suppliers', 'customer_contacts')
            AND tc.constraint_type = 'FOREIGN KEY'
        LOOP
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
        END LOOP;
      END $$
    `);

    // Drop old tables
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate customers table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id"              UUID PRIMARY KEY,
        "tenantId"        UUID NOT NULL,
        "name"            VARCHAR(255) NOT NULL,
        "contactPerson"   VARCHAR(255),
        "email"           VARCHAR(255),
        "phone"           VARCHAR(50),
        "nif"             VARCHAR(20),
        "rc"              VARCHAR(20),
        "ai"              VARCHAR(20),
        "nis"             VARCHAR(20),
        "address"         TEXT,
        "city"            VARCHAR(100),
        "country"         VARCHAR(100),
        "shippingAddress" TEXT,
        "shippingCity"    VARCHAR(100),
        "notes"           TEXT,
        "isActive"        BOOLEAN NOT NULL DEFAULT true,
        "createdBy"       VARCHAR,
        "updatedBy"       VARCHAR,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deletedAt"       TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      INSERT INTO customers SELECT id, "tenantId", name, "contactPerson", email, phone, nif, rc, ai, nis,
        address, city, country, "shippingAddress", "shippingCity", notes, "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      FROM contacts WHERE "isCustomer" = true
    `);

    // Recreate suppliers table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "suppliers" (
        "id" UUID PRIMARY KEY, "tenantId" UUID NOT NULL, "name" VARCHAR(255) NOT NULL,
        "contactPerson" VARCHAR(255), "email" VARCHAR(255), "phone" VARCHAR(50),
        "address" TEXT, "city" VARCHAR(100), "country" VARCHAR(100), "notes" TEXT,
        "createdBy" VARCHAR, "updatedBy" VARCHAR,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deletedAt" TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      INSERT INTO suppliers SELECT id, "tenantId", name, "contactPerson", email, phone,
        address, city, country, notes, "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"
      FROM contacts WHERE "isSupplier" = true
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "contact_contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
  }
}
