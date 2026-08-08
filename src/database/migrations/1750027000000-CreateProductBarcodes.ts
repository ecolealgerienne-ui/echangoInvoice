import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Codes-barres des articles.
 *
 * Une table plutôt qu'une colonne : un même article porte couramment un EAN à
 * l'unité et un autre au carton, auxquels s'ajoutent les codes internes et ceux
 * du fabricant. Une colonne obligerait à choisir lequel garder.
 *
 * `packQuantity` est ce qui rend la table utile au-delà de l'identification :
 * scanner le code du carton doit ajouter douze unités, pas une.
 *
 * L'unicité est **par locataire** : deux sociétés peuvent parfaitement utiliser
 * le même code interne, et la contrainte doit les laisser faire (R020).
 */
export class CreateProductBarcodes1750027000000 implements MigrationInterface {
  name = 'CreateProductBarcodes1750027000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_barcodes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "finishedProductId" uuid NOT NULL,
        "barcode" varchar(64) NOT NULL,
        "type" varchar(20) NOT NULL DEFAULT 'INTERNE',
        "packQuantity" decimal(10,2) NOT NULL DEFAULT 1,
        "isPrimary" boolean NOT NULL DEFAULT false,
        "label" varchar(60),
        "createdBy" varchar,
        "updatedBy" varchar,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        CONSTRAINT "PK_product_barcodes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_barcodes_code_tenant" UNIQUE ("barcode", "tenantId"),
        CONSTRAINT "FK_product_barcodes_product"
          FOREIGN KEY ("finishedProductId") REFERENCES "finished_products"("id") ON DELETE CASCADE
      )
    `);

    // R016 — FK et colonnes de filtre indexées.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_barcodes_tenantId" ON "product_barcodes" ("tenantId")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_barcodes_productId" ON "product_barcodes" ("finishedProductId")`);
    // La recherche par scan est une égalité sur (tenantId, barcode) : c'est
    // l'index qui décide si le scan répond en 2 ms ou en 200.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_barcodes_lookup" ON "product_barcodes" ("tenantId", "barcode")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_barcodes"`);
  }
}
