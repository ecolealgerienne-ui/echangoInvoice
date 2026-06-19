import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreditNotes1709981000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_notes" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"         uuid NOT NULL,
        "creditNoteNumber" varchar(50) NOT NULL,
        "customerId"       uuid NOT NULL,
        "salesInvoiceId"   uuid,
        "creditNoteDate"   date NOT NULL,
        "reason"           text,
        "notes"            text,
        "subtotal"         decimal(12,2) NOT NULL DEFAULT 0,
        "taxAmount"        decimal(12,2) NOT NULL DEFAULT 0,
        "totalAmount"      decimal(12,2) NOT NULL DEFAULT 0,
        "status"           varchar(20) NOT NULL DEFAULT 'draft',
        "createdBy"        varchar,
        "updatedBy"        varchar,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        "deletedAt"        timestamptz,
        CONSTRAINT "UQ_credit_notes_number_tenant" UNIQUE ("creditNoteNumber", "tenantId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_note_items" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"      uuid NOT NULL,
        "creditNoteId"  uuid NOT NULL REFERENCES "credit_notes"("id"),
        "description"   text NOT NULL,
        "quantity"      decimal(10,2) NOT NULL,
        "unit"          varchar(50),
        "unitPrice"     decimal(12,2) NOT NULL,
        "taxName1"      varchar(50),
        "taxRate1"      decimal(5,2),
        "taxAmount1"    decimal(12,2) NOT NULL DEFAULT 0,
        "lineTaxTotal"  decimal(12,2) NOT NULL DEFAULT 0,
        "lineTotal"     decimal(12,2) NOT NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_credit_notes_tenant_id"   ON "credit_notes" ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_credit_notes_customer_id" ON "credit_notes" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_credit_notes_status"      ON "credit_notes" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_credit_note_items_cn_id"  ON "credit_note_items" ("creditNoteId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_note_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_notes"`);
  }
}
