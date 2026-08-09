import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grilles tarifaires par client.
 *
 * Jusqu'ici un article n'avait qu'un `defaultSalesPrice`, ressaisi à la main
 * sur chaque ligne : impossible de vendre au même article un prix détaillant et
 * un prix centrale. C'est la réalité du B2B, et le principal écart fonctionnel
 * relevé face à Erplain (docs/BENCHMARK.md).
 *
 * La grille fournit un prix PROPOSÉ, pas imposé : le prix d'une ligne reste
 * saisissable, un commercial négocie. C'est aussi ce que fait Erplain.
 */
export class CreatePriceLists1750023000000 implements MigrationInterface {
  name = 'CreatePriceLists1750023000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_lists" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name"        varchar(120) NOT NULL,
        "description" text,
        "isActive"    boolean NOT NULL DEFAULT true,
        "createdBy"   varchar,
        "updatedBy"   varchar,
        "createdAt"   timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now(),
        "deletedAt"   timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_price_lists_tenant_id" ON "price_lists" ("tenantId")`,
    );
    // Deux grilles homonymes dans le même espace ne se distinguent pas à
    // l'écran. La contrainte est partielle : une grille supprimée ne doit pas
    // bloquer la réutilisation de son nom.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_price_lists_name_tenant"
      ON "price_lists" ("tenantId", lower("name")) WHERE "deletedAt" IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_list_items" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId"          uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "priceListId"       uuid NOT NULL REFERENCES "price_lists"("id") ON DELETE CASCADE,
        "finishedProductId" uuid NOT NULL REFERENCES "finished_products"("id") ON DELETE CASCADE,
        "unitPrice"         numeric(12,2) NOT NULL,
        "createdAt"         timestamptz NOT NULL DEFAULT now(),
        "updatedAt"         timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_price_list_items_list" ON "price_list_items" ("priceListId")`,
    );
    // Un article ne peut pas avoir deux prix dans la même grille : sans cette
    // contrainte, la résolution deviendrait non déterministe.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_price_list_items_list_product"
      ON "price_list_items" ("priceListId", "finishedProductId")
    `);

    await queryRunner.query(`
      ALTER TABLE "partners"
      ADD COLUMN IF NOT EXISTS "priceListId" uuid REFERENCES "price_lists"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_partners_price_list_id" ON "partners" ("priceListId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "partners" DROP COLUMN IF EXISTS "priceListId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_list_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_lists"`);
  }
}
