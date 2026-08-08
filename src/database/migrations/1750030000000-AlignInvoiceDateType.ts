import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `sales_invoices.invoiceDate` : timestamptz → date.
 *
 * L'entité déclare `date`, la base portait `timestamp with time zone`. Cet
 * écart n'était pas qu'un détail de typage : un `migration:generate` lancé pour
 * tout autre motif émettait `DROP COLUMN "invoiceDate"` suivi d'un `ADD`, ce
 * qui aurait effacé la date de chaque facture émise (docs/ERREURS.md E006).
 *
 * Il cachait aussi un défaut fonctionnel. Le tableau de bord filtre par
 * `invoiceDate BETWEEN $from AND $to` : avec un horodatage, une facture datée
 * du dernier jour à 14 h tombe *après* la borne de fin, qui vaut minuit. Une
 * facture par mois échappait ainsi au chiffre d'affaires du mois.
 *
 * `USING` convertit en conservant la partie date. La partie heure est perdue —
 * une date de facture n'en a pas besoin, et `dueDate` était déjà en `date`.
 */
export class AlignInvoiceDateType1750030000000 implements MigrationInterface {
  name = 'AlignInvoiceDateType1750030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales_invoices"
       ALTER COLUMN "invoiceDate" TYPE date USING "invoiceDate"::date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Réversible dans sa forme, pas dans son contenu : l'heure d'origine n'est
    // pas récupérable. Les valeurs repassent à minuit.
    await queryRunner.query(
      `ALTER TABLE "sales_invoices"
       ALTER COLUMN "invoiceDate" TYPE timestamptz USING "invoiceDate"::timestamptz`,
    );
  }
}
