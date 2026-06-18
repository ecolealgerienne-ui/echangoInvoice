import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoicesAndPayments1709980600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Complète la table sales_invoices créée en stub dans migration Quotes
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
        ADD COLUMN IF NOT EXISTS "deliveryNoteId" uuid,
        ADD COLUMN IF NOT EXISTS "quoteId" uuid
    `);

    // Contraintes FK (si pas déjà présentes)
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_sales_invoices_delivery_note'
        ) THEN
          ALTER TABLE "sales_invoices"
            ADD CONSTRAINT "FK_sales_invoices_delivery_note"
            FOREIGN KEY ("deliveryNoteId") REFERENCES "delivery_notes"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_sales_invoices_customer'
        ) THEN
          ALTER TABLE "sales_invoices"
            ADD CONSTRAINT "FK_sales_invoices_customer"
            FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    // Enum status (la colonne est varchar dans le stub → remplacer par enum)
    await queryRunner.query(`
      CREATE TYPE "sales_invoices_status_enum"
        AS ENUM ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')
    `);
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
        ALTER COLUMN "status" TYPE "sales_invoices_status_enum"
        USING "status"::"sales_invoices_status_enum"
    `);

    // Indexes sales_invoices (complète ceux déjà créés dans le stub)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_tenant_id"     ON "sales_invoices" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_customer_id"   ON "sales_invoices" ("customerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_delivery_note" ON "sales_invoices" ("deliveryNoteId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_quote_id"      ON "sales_invoices" ("quoteId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_status"        ON "sales_invoices" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_invoice_date"  ON "sales_invoices" ("invoiceDate")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_due_date"      ON "sales_invoices" ("dueDate")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoices_deleted_at"    ON "sales_invoices" ("deletedAt")`);

    // Indexes sales_invoice_items (complète ceux du stub)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoice_items_invoice_id" ON "sales_invoice_items" ("salesInvoiceId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoice_items_tenant_id"  ON "sales_invoice_items" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_invoice_items_product_id" ON "sales_invoice_items" ("finishedProductId")`);

    // Payments table
    await queryRunner.query(`
      CREATE TYPE "payments_method_enum"
        AS ENUM ('cash', 'bank_transfer', 'cheque', 'other')
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id"              uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId"        uuid NOT NULL,
        "salesInvoiceId"  uuid NOT NULL,
        "amount"          decimal(12,2) NOT NULL,
        "paymentDate"     date NOT NULL,
        "paymentMethod"   "payments_method_enum" NOT NULL,
        "reference"       varchar(100),
        "notes"           text,
        "createdBy"       varchar,
        "updatedBy"       varchar,
        "createdAt"       timestamptz NOT NULL DEFAULT now(),
        "updatedAt"       timestamptz NOT NULL DEFAULT now(),
        "deletedAt"       timestamptz,
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_invoice" FOREIGN KEY ("salesInvoiceId")
          REFERENCES "sales_invoices"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payments_tenant_id"        ON "payments" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_sales_invoice_id" ON "payments" ("salesInvoiceId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_payment_date"     ON "payments" ("paymentDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_deleted_at"       ON "payments" ("deletedAt")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payments_method_enum"`);
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
        ALTER COLUMN "status" TYPE varchar(20) USING status::text,
        DROP COLUMN IF EXISTS "deliveryNoteId",
        DROP COLUMN IF EXISTS "quoteId"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "sales_invoices_status_enum"`);
  }
}
