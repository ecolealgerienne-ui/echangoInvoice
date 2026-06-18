import { MigrationInterface, QueryRunner } from 'typeorm';

export class Quotes1709980400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Stub sales_invoices table (full module comes in Module 08)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sales_invoices" (
        "id"               uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"         uuid NOT NULL,
        "invoiceNumber"    varchar(20) NOT NULL,
        "customerId"       uuid NOT NULL,
        "invoiceDate"      timestamptz NOT NULL DEFAULT now(),
        "dueDate"          date,
        "status"           varchar(20) NOT NULL DEFAULT 'draft',
        "subtotal"         decimal(12,2) NOT NULL DEFAULT 0,
        "taxAmount"        decimal(12,2) NOT NULL DEFAULT 0,
        "totalAmount"      decimal(12,2) NOT NULL DEFAULT 0,
        "amountPaid"       decimal(12,2) NOT NULL DEFAULT 0,
        "amountDue"        decimal(12,2) NOT NULL DEFAULT 0,
        "notes"            text,
        "quoteId"          uuid,
        "createdBy"        varchar,
        "updatedBy"        varchar,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        "deletedAt"        timestamptz,
        CONSTRAINT "PK_sales_invoices" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
        ADD CONSTRAINT IF NOT EXISTS "UQ_sales_invoices_number_tenant"
        UNIQUE ("invoiceNumber", "tenantId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sales_invoice_items" (
        "id"                 uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"           uuid NOT NULL,
        "salesInvoiceId"     uuid NOT NULL,
        "finishedProductId"  uuid NOT NULL,
        "quantity"           decimal(10,2) NOT NULL,
        "unit"               varchar(50) NOT NULL,
        "unitPrice"          decimal(12,2) NOT NULL,
        "taxName1"           varchar(100),
        "taxRate1"           decimal(5,2),
        "taxAmount1"         decimal(12,2) NOT NULL DEFAULT 0,
        "taxName2"           varchar(100),
        "taxRate2"           decimal(5,2),
        "taxAmount2"         decimal(12,2) NOT NULL DEFAULT 0,
        "lineTaxTotal"       decimal(12,2) NOT NULL DEFAULT 0,
        "lineTotal"          decimal(12,2) NOT NULL,
        "createdAt"          timestamptz NOT NULL DEFAULT now(),
        "updatedAt"          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_invoice_items" PRIMARY KEY ("id")
      )
    `);

    // Indexes for sales_invoices
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_tenant_id"   ON "sales_invoices" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_customer_id" ON "sales_invoices" ("customerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_status"      ON "sales_invoices" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_deleted_at"  ON "sales_invoices" ("deletedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoice_items_inv_id" ON "sales_invoice_items" ("salesInvoiceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoice_items_tenant" ON "sales_invoice_items" ("tenantId")`);

    // quotes table
    await queryRunner.query(`
      CREATE TYPE "quotes_status_enum" AS ENUM (
        'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quotes" (
        "id"                    uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"              uuid NOT NULL,
        "quoteNumber"           varchar(20) NOT NULL,
        "customerId"            uuid NOT NULL,
        "quoteDate"             date NOT NULL,
        "expiryDate"            date,
        "status"                "quotes_status_enum" NOT NULL DEFAULT 'draft',
        "subtotal"              decimal(12,2) NOT NULL DEFAULT 0,
        "taxAmount"             decimal(12,2) NOT NULL DEFAULT 0,
        "totalAmount"           decimal(12,2) NOT NULL DEFAULT 0,
        "notes"                 text,
        "convertedToInvoiceId"  uuid,
        "createdBy"             varchar,
        "updatedBy"             varchar,
        "createdAt"             timestamptz NOT NULL DEFAULT now(),
        "updatedAt"             timestamptz NOT NULL DEFAULT now(),
        "deletedAt"             timestamptz,
        CONSTRAINT "PK_quotes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_quotes_number_tenant" UNIQUE ("quoteNumber", "tenantId"),
        CONSTRAINT "FK_quotes_customer" FOREIGN KEY ("customerId")
          REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_quotes_invoice" FOREIGN KEY ("convertedToInvoiceId")
          REFERENCES "sales_invoices"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quote_items" (
        "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "quoteId"           uuid NOT NULL,
        "finishedProductId" uuid NOT NULL,
        "quantity"          decimal(10,2) NOT NULL,
        "unit"              varchar(50) NOT NULL,
        "unitPrice"         decimal(12,2) NOT NULL,
        "taxName1"          varchar(100),
        "taxRate1"          decimal(5,2),
        "taxAmount1"        decimal(12,2) NOT NULL DEFAULT 0,
        "taxName2"          varchar(100),
        "taxRate2"          decimal(5,2),
        "taxAmount2"        decimal(12,2) NOT NULL DEFAULT 0,
        "lineTaxTotal"      decimal(12,2) NOT NULL DEFAULT 0,
        "lineTotal"         decimal(12,2) NOT NULL,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quote_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quote_items_quote" FOREIGN KEY ("quoteId")
          REFERENCES "quotes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_quote_items_product" FOREIGN KEY ("finishedProductId")
          REFERENCES "finished_products"("id") ON DELETE RESTRICT
      )
    `);

    // Indexes for quotes
    await queryRunner.query(`CREATE INDEX "IDX_quotes_tenant_id"         ON "quotes" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_customer_id"       ON "quotes" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_status"            ON "quotes" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_quote_date"        ON "quotes" ("quoteDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_expiry_date"       ON "quotes" ("expiryDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_deleted_at"        ON "quotes" ("deletedAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_quotes_converted_invoice" ON "quotes" ("convertedToInvoiceId")`);

    // Indexes for quote_items
    await queryRunner.query(`CREATE INDEX "IDX_quote_items_tenant_id"           ON "quote_items" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_quote_items_quote_id"            ON "quote_items" ("quoteId")`);
    await queryRunner.query(`CREATE INDEX "IDX_quote_items_finished_product_id" ON "quote_items" ("finishedProductId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "quote_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "quotes_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_invoice_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales_invoices"`);
  }
}
