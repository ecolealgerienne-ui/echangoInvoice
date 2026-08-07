import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Donne un effet comptable aux avoirs.
 *
 * Jusqu'ici, émettre un avoir ne faisait que passer son statut à `issued` : le
 * solde de la facture ne bougeait pas, et le statut `applied` prévu par
 * l'entité n'était atteint par aucun chemin de code. Un avoir était un document
 * décoratif.
 *
 * `creditedAmount` porte la part de la facture éteinte par un avoir. Colonne
 * distincte d'`amountPaid` à dessein : un avoir n'est pas un encaissement. Les
 * confondre ferait apparaître un règlement fantôme dans l'historique des
 * règlements, fausserait le montant encaissé des rapports et casserait
 * l'invariant « somme des règlements = amountPaid ».
 *
 * Le nouvel invariant est :
 *   amountPaid + creditedAmount + amountDue = totalAmount
 */
export class AddCreditedAmountToSalesInvoices1750022000000 implements MigrationInterface {
  name = 'AddCreditedAmountToSalesInvoices1750022000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoices"
      ADD COLUMN IF NOT EXISTS "creditedAmount" numeric(12,2) NOT NULL DEFAULT 0
    `);

    // Les avoirs déjà émis n'avaient rien décompté : rien à reprendre. Aucun
    // avoir existant ne porte le statut `applied`, puisqu'il était inatteignable.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales_invoices" DROP COLUMN IF EXISTS "creditedAmount"
    `);
  }
}
