import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abonnements de facturation — factures récurrentes.
 *
 * Un modèle porte le client, les lignes et la cadence ; chaque échéance produit
 * une vraie facture, en brouillon. Le brouillon est délibéré : personne ne veut
 * qu'une facture parte au client sans avoir été regardée, et une facture émise
 * ne se corrige pas, elle s'annule par un avoir.
 *
 * `nextRunDate` porte la prochaine échéance et sert d'index au cron. La stocker
 * plutôt que la recalculer évite de rejouer tout l'historique à chaque passage,
 * et rend visible dans l'écran ce que le cron va faire.
 */
export class CreateRecurringInvoices1750032000000 implements MigrationInterface {
  name = 'CreateRecurringInvoices1750032000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recurring_invoices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "customerId" uuid NOT NULL,
        "label" varchar(120) NOT NULL,
        "frequency" varchar(20) NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date,
        "nextRunDate" date NOT NULL,
        "lastRunAt" timestamptz,
        "paymentTermsDays" int NOT NULL DEFAULT 30,
        "paymentMode" varchar(20) NOT NULL DEFAULT 'other',
        "notes" text,
        "isActive" boolean NOT NULL DEFAULT true,
        "generatedCount" int NOT NULL DEFAULT 0,
        "createdBy" varchar,
        "updatedBy" varchar,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_recurring_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recurring_invoices_customer"
          FOREIGN KEY ("customerId") REFERENCES "partners"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recurring_invoice_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "recurringInvoiceId" uuid NOT NULL,
        "finishedProductId" uuid NOT NULL,
        "quantity" decimal(10,2) NOT NULL,
        "unit" varchar(50) NOT NULL,
        "unitPrice" decimal(12,2) NOT NULL,
        "taxRate1" decimal(5,2),
        CONSTRAINT "PK_recurring_invoice_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recurring_items_parent"
          FOREIGN KEY ("recurringInvoiceId") REFERENCES "recurring_invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_recurring_items_product"
          FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recurring_invoices_tenantId" ON "recurring_invoices" ("tenantId")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recurring_invoices_customerId" ON "recurring_invoices" ("customerId")`);
    // Index du cron : il cherche les échéances dues, tous locataires confondus.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recurring_invoices_due" ON "recurring_invoices" ("nextRunDate", "isActive")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recurring_items_parent" ON "recurring_invoice_items" ("recurringInvoiceId")`);

    // Trace de la facture engendrée : sans elle, rien ne relie une facture à
    // son abonnement, et un doublon serait indétectable.
    await queryRunner.query(
      `ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "recurringInvoiceId" uuid`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_recurring" ON "sales_invoices" ("recurringInvoiceId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN IF EXISTS "recurringInvoiceId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_invoice_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_invoices"`);
  }
}
