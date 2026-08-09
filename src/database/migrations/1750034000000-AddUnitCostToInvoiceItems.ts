import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fige le coût unitaire sur la ligne de facture.
 *
 * La marge brute était calculée « chiffre d'affaires moins achats reçus sur la
 * période ». Ce n'est pas une marge : un mois où l'on vend sur stock sans se
 * réapprovisionner affichait 93 %, un mois de gros réassort aurait affiché une
 * marge négative. Les deux étaient faux.
 *
 * La marge se calcule sur le **coût des marchandises vendues**, donc sur les
 * lignes de facture. Or elles ne portaient aucun coût : il fallait aller le
 * chercher sur l'article, dont le coût moyen bouge à chaque réception. La marge
 * d'une facture de janvier changeait donc rétroactivement en mars.
 *
 * `unitCost` fige le coût au moment de l'émission. Une facture émise ne bouge
 * plus — ni son montant, ni sa marge.
 *
 * Le remplissage rétroactif prend le coût moyen actuel de l'article, faute de
 * mieux : c'est une approximation sur l'historique, exacte à partir de
 * maintenant. Les lignes sans article rattaché restent à NULL et le calcul les
 * traite comme un coût nul, ce qui surestime la marge plutôt que de l'inventer.
 */
export class AddUnitCostToInvoiceItems1750034000000 implements MigrationInterface {
  name = 'AddUnitCostToInvoiceItems1750034000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoice_items"
      ADD COLUMN IF NOT EXISTS "unitCost" numeric(12,2)
    `);

    await queryRunner.query(`
      UPDATE "sales_invoice_items" sii
         SET "unitCost" = COALESCE(
               NULLIF(fp."averageCostPerUnit", 0),
               NULLIF(fp."lastCostPerUnit", 0),
               0)
        FROM "finished_products" fp
       WHERE fp.id = sii."finishedProductId"
         AND sii."unitCost" IS NULL
    `);

    // Même traitement sur les avoirs : un avoir annule une vente, il doit
    // annuler la marge correspondante, pas seulement le montant.
    await queryRunner.query(`
      ALTER TABLE "credit_note_items"
      ADD COLUMN IF NOT EXISTS "unitCost" numeric(12,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "credit_note_items" DROP COLUMN IF EXISTS "unitCost"`);
    await queryRunner.query(`ALTER TABLE "sales_invoice_items" DROP COLUMN IF EXISTS "unitCost"`);
  }
}
