import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Champs manquants sur la fiche article et la fiche dépense.
 *
 * **Article.** Le taux de TVA est la correction la plus utile : il était saisi
 * ligne par ligne alors qu'en Algérie c'est 19 % ou 9 % *selon le produit*.
 * Le saisir à chaque ligne, c'est se tromper un jour sur deux.
 *
 * La famille est un `varchar` et non une table dédiée : elle sert à filtrer et
 * à regrouper, pas à porter des règles. Une table imposerait un écran de
 * gestion pour un besoin que l'auto-complétion sur les valeurs existantes
 * couvre. À reprendre le jour où une famille devra porter un taux ou un compte
 * comptable.
 *
 * **Dépense.** La TVA récupérable manquait au G50 : nous n'y comptions que les
 * factures fournisseurs, alors qu'une dépense sur facture ouvre le même droit.
 */
export class EnrichProductsAndExpenses1750033000000 implements MigrationInterface {
  name = 'EnrichProductsAndExpenses1750033000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Article ──────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "taxRate" decimal(5,2)`);
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "category" varchar(80)`);
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "imageUrl" text`);
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "minStock" decimal(10,2)`);
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "maxStock" decimal(10,2)`);
    // Colisage : combien d'unités de stock dans un conditionnement de vente.
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "packQuantity" decimal(10,2)`);
    await queryRunner.query(
      `ALTER TABLE "finished_products" ADD COLUMN IF NOT EXISTS "packUnit" varchar(50)`);

    // La famille sert de filtre : sans index, elle rame dès le millier d'articles.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_finished_products_category" ON "finished_products" ("tenantId", "category")`);

    // ── Dépense ──────────────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "supplierId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paymentMethod" varchar(20)`);
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vatRate" decimal(5,2)`);
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vatAmount" decimal(12,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "isRecurring" boolean NOT NULL DEFAULT false`);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_expenses_supplierId" ON "expenses" ("supplierId")`);

    // `ON DELETE SET NULL` : supprimer un fournisseur ne doit pas effacer une
    // dépense déjà comptabilisée, seulement la détacher.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_supplier"
          FOREIGN KEY ("supplierId") REFERENCES "partners"("id") ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "FK_expenses_supplier"`);
    for (const c of ['isRecurring', 'vatAmount', 'vatRate', 'paymentMethod', 'supplierId']) {
      await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN IF EXISTS "${c}"`);
    }
    for (const c of ['packUnit', 'packQuantity', 'maxStock', 'minStock', 'imageUrl', 'category', 'taxRate']) {
      await queryRunner.query(`ALTER TABLE "finished_products" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
