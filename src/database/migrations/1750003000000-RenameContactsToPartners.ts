import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameContactsToPartners1750003000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Drop FK on contact_contacts before renaming
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT tc.constraint_name, tc.table_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
          JOIN information_schema.table_constraints tc2 ON rc.unique_constraint_name = tc2.constraint_name
          WHERE tc2.table_name = 'contacts' AND tc.constraint_type = 'FOREIGN KEY'
        LOOP
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
        END LOOP;
      END $$
    `);

    await queryRunner.query(`ALTER TABLE IF EXISTS "contact_contacts" RENAME COLUMN "contactId" TO "partnerId"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "contact_contacts" RENAME TO "partner_contacts"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "contacts" RENAME TO "partners"`);

    await queryRunner.query(`ALTER TABLE "partner_contacts" ADD CONSTRAINT "FK_partner_contacts_partner" FOREIGN KEY ("partnerId") REFERENCES "partners"(id)`);

    // Update indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_tenant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contacts_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contact_contacts_tenant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contact_contacts_contact_id"`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_partners_tenant_id" ON "partners" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_partners_email" ON "partners" ("email")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_partner_contacts_tenant_id" ON "partner_contacts" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_partner_contacts_partner_id" ON "partner_contacts" ("partnerId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE IF EXISTS "partner_contacts" DROP CONSTRAINT IF EXISTS "FK_partner_contacts_partner"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "partner_contacts" RENAME COLUMN "partnerId" TO "contactId"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "partner_contacts" RENAME TO "contact_contacts"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "partners" RENAME TO "contacts"`);
    await queryRunner.query(`ALTER TABLE "contact_contacts" ADD CONSTRAINT "FK_contact_contacts_contact" FOREIGN KEY ("contactId") REFERENCES "contacts"(id)`);
  }
}
