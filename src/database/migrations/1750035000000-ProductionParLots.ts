import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La production passe par les lots, et l'ordre fige sa recette.
 *
 * ── Ce que ça répare ──────────────────────────────────────────────────────
 *
 * Le stock est tenu par lots (`stock_entries`) : date d'entrée, péremption,
 * coût, FIFO — c'est R015. Les ventes le respectent. La production, écrite
 * avant la refonte des lots, écrivait directement sur l'agrégat :
 *
 *     UPDATE finished_products SET "stockQuantity" = "stockQuantity" - 30
 *
 * sans toucher aux lots. Or `recomputeProductStock()` recalcule cet agrégat
 * **depuis les seuls lots**, et l'écrase donc à la première réception ou
 * livraison suivante :
 *
 *     réception 100 kg          lots 100   agrégat 100
 *     production consomme 30    lots 100   agrégat  70
 *     livraison de 10 → recompute  lots 90   agrégat  90   ← les 30 reviennent
 *
 * C'est exactement le défaut déjà rencontré et corrigé côté ventes le
 * 2026-08-08 (voir `deliveries.service.ts`) : la correction n'avait pas été
 * portée à la production.
 *
 * Versant sortie, c'était pire : le produit fabriqué ne créait **aucun lot**.
 * Il n'avait donc ni numéro de lot ni date de péremption — rédhibitoire pour
 * de l'agroalimentaire — et le premier `recompute` effaçait la quantité
 * produite, puisqu'elle n'existait dans aucun lot.
 *
 * ── Ce que la migration ajoute ────────────────────────────────────────────
 *
 * 1. Un statut `consumed` sur les lots. `adjusted` aurait pu servir, mais il
 *    désigne une régularisation d'inventaire : confondre une consommation de
 *    production avec une correction d'erreur rendrait les états illisibles.
 *
 * 2. Deux liens sur le lot — celui qui l'a consommé, celui qui l'a produit.
 *    C'est ce qui donne la traçabilité amont/aval : quel lot de matière est
 *    entré dans quel lot de produit fini.
 *
 * 3. `production_order_lines` : la recette **figée au démarrage** de l'ordre.
 *    Sans elle, modifier une nomenclature réécrit rétroactivement ce sur quoi
 *    les ordres passés se sont appuyés — le champ `version` de la
 *    nomenclature existait mais ne servait à rien, l'ordre ne stockant que
 *    `nomenclatureId`.
 *
 * Aucune reprise de données : la table des ordres est vide au moment de cette
 * migration. Un ordre déjà `in_progress` sans lignes figées serait refusé à la
 * clôture plutôt que de retomber en silence sur la nomenclature courante.
 */
export class ProductionParLots1750035000000 implements MigrationInterface {
  name = 'ProductionParLots1750035000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `ADD VALUE` est irréversible : PostgreSQL ne sait pas retirer une
    // valeur d'un type énuméré.
    await queryRunner.query(
      `ALTER TYPE "stock_entry_status_enum" ADD VALUE IF NOT EXISTS 'consumed'`,
    );

    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        ADD COLUMN IF NOT EXISTS "consumedByProductionOrderId" uuid,
        ADD COLUMN IF NOT EXISTS "producedByProductionOrderId" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_entries_consumed_by_po"
        ON "stock_entries" ("consumedByProductionOrderId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_entries_produced_by_po"
        ON "stock_entries" ("producedByProductionOrderId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_order_lines" (
        "id"                uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId"          uuid NOT NULL,
        "productionOrderId" uuid NOT NULL,
        "rawMaterialId"     uuid NOT NULL,
        "order"             integer NOT NULL DEFAULT 1,
        "quantityPerUnit"   numeric(10,2) NOT NULL,
        "unit"              character varying(50) NOT NULL,
        "unitCost"          numeric(10,2) NOT NULL DEFAULT 0,
        "lineCost"          numeric(12,2) NOT NULL DEFAULT 0,
        "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_production_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_2bf07a0807da8b38af6c029efd2"
          FOREIGN KEY ("productionOrderId")
          REFERENCES "production_orders"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_production_order_lines_tenantId"
        ON "production_order_lines" ("tenantId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_production_order_lines_orderId"
        ON "production_order_lines" ("productionOrderId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_production_order_lines_rawMaterialId"
        ON "production_order_lines" ("rawMaterialId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "production_order_lines"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_entries_produced_by_po"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_entries_consumed_by_po"`);
    await queryRunner.query(`
      ALTER TABLE "stock_entries"
        DROP COLUMN IF EXISTS "producedByProductionOrderId",
        DROP COLUMN IF EXISTS "consumedByProductionOrderId"
    `);

    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM stock_entries WHERE status = 'consumed'`,
    );
    if (count > 0) {
      throw new Error(
        `Impossible d'annuler : ${count} lot(s) portent le statut « consumed ». `
        + `Les repasser en « adjusted » d'abord, puis relancer.`,
      );
    }
    // La valeur reste dans le type énuméré : PostgreSQL ne sait pas la
    // retirer. Le dire, plutôt que de laisser croire à une annulation complète.
  }
}
