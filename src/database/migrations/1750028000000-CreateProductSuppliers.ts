import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fournisseurs d'un article.
 *
 * `finished_products.supplierId` ne portait qu'un seul fournisseur : impossible
 * de comparer deux offres, ni de garder la référence du fournisseur, son délai
 * ou son conditionnement. Or c'est exactement ce qu'on regarde avant de passer
 * une commande.
 *
 * La colonne d'origine est **conservée** : elle est encore lue par le
 * catalogue et par les écrans d'achat. La reprise des données la recopie ici,
 * et le jour où plus rien ne la lit, elle pourra tomber dans sa propre
 * migration — pas dans celle-ci, qui doit rester réversible sans perte.
 */
export class CreateProductSuppliers1750028000000 implements MigrationInterface {
  name = 'CreateProductSuppliers1750028000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "finishedProductId" uuid NOT NULL,
        "supplierId" uuid NOT NULL,
        "supplierRef" varchar(80),
        "purchasePrice" decimal(12,2) NOT NULL DEFAULT 0,
        "leadTimeDays" int,
        "packQuantity" decimal(10,2) NOT NULL DEFAULT 1,
        "isPreferred" boolean NOT NULL DEFAULT false,
        "notes" text,
        "createdBy" varchar,
        "updatedBy" varchar,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_product_suppliers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_suppliers_pair" UNIQUE ("finishedProductId", "supplierId", "tenantId"),
        CONSTRAINT "FK_product_suppliers_product"
          FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_suppliers_supplier"
          FOREIGN KEY ("supplierId") REFERENCES "partners"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_suppliers_tenantId" ON "product_suppliers" ("tenantId")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_suppliers_productId" ON "product_suppliers" ("finishedProductId")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_suppliers_supplierId" ON "product_suppliers" ("supplierId")`);

    // Reprise : le fournisseur unique déjà saisi devient le fournisseur
    // préféré. Sans cela, la nouvelle table s'ouvrirait vide et l'information
    // existante paraîtrait perdue.
    await queryRunner.query(`
      INSERT INTO "product_suppliers"
        ("tenantId", "finishedProductId", "supplierId", "purchasePrice", "isPreferred")
      SELECT p."tenantId", p.id, p."supplierId", COALESCE(p."lastCostPerUnit", 0), true
      FROM "finished_products" p
      WHERE p."supplierId" IS NOT NULL AND p."deletedAt" IS NULL
        AND EXISTS (SELECT 1 FROM "partners" f WHERE f.id = p."supplierId")
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_suppliers"`);
  }
}
