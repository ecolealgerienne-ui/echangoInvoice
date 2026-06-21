import { MigrationInterface, QueryRunner } from 'typeorm';

export class VendorBills1750001000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "vendor_bills_status_enum" AS ENUM
        ('draft','validated','partial','paid','cancelled')
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_bills" (
        "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"         uuid NOT NULL,
        "billNumber"       varchar(50) NOT NULL,
        "supplierId"       uuid NOT NULL,
        "purchaseOrderId"  uuid,
        "receptionBlId"    uuid,
        "billDate"         date NOT NULL,
        "dueDate"          date,
        "subtotal"         decimal(12,2) NOT NULL DEFAULT 0,
        "taxAmount"        decimal(12,2) NOT NULL DEFAULT 0,
        "totalAmount"      decimal(12,2) NOT NULL DEFAULT 0,
        "amountPaid"       decimal(12,2) NOT NULL DEFAULT 0,
        "amountDue"        decimal(12,2) NOT NULL DEFAULT 0,
        "status"           "vendor_bills_status_enum" NOT NULL DEFAULT 'draft',
        "notes"            text,
        "createdBy"        varchar,
        "updatedBy"        varchar,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now(),
        "deletedAt"        timestamptz,
        UNIQUE ("billNumber", "tenantId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_bill_items" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL,
        "vendorBillId"      uuid NOT NULL,
        "finishedProductId" uuid,
        "description"       varchar(500),
        "quantity"          decimal(10,2) NOT NULL,
        "unit"              varchar(50) NOT NULL,
        "unitPrice"         decimal(12,2) NOT NULL,
        "taxRate"           decimal(5,2),
        "taxAmount"         decimal(12,2) NOT NULL DEFAULT 0,
        "lineTotal"         decimal(12,2) NOT NULL,
        "createdAt"         timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "vendor_payments_method_enum" AS ENUM
        ('bank_transfer','cheque','cash','other')
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_payments" (
        "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"      uuid NOT NULL,
        "vendorBillId"  uuid NOT NULL,
        "amount"        decimal(12,2) NOT NULL,
        "paymentDate"   date NOT NULL,
        "method"        "vendor_payments_method_enum" NOT NULL DEFAULT 'bank_transfer',
        "reference"     varchar(255),
        "createdBy"     varchar,
        "createdAt"     timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_vendor_bills_tenant_id"    ON "vendor_bills"      ("tenantId")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_bills_supplier_id"  ON "vendor_bills"      ("supplierId")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_bills_status"       ON "vendor_bills"      ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_bills_bill_date"    ON "vendor_bills"      ("billDate")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_bill_items_bill_id" ON "vendor_bill_items" ("vendorBillId")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendor_payments_bill_id"   ON "vendor_payments"   ("vendorBillId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_bill_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_bills"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vendor_payments_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "vendor_bills_status_enum"`);
  }
}
