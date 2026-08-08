import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Droit de timbre sur les factures (art. 100 du code du timbre).
 *
 * `docs/CONFORMITE-FISCALE.md` §2 : le mode de règlement était enregistré sur
 * l'encaissement (`payments.paymentMethod`) mais pas sur la facture au moment
 * de l'émission — or c'est lui qui décide si le timbre est dû. D'où
 * `paymentMode` ici.
 *
 * `stampDutyEnabled` est FAUX par défaut : la migration ne change aucun montant
 * existant, et les sociétés qui n'encaissent jamais d'espèces restent hors du
 * dispositif.
 */
export class AddStampDutyToInvoices1750026000000 implements MigrationInterface {
  name = 'AddStampDutyToInvoices1750026000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "stampDutyEnabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "paymentMode" varchar(20) NOT NULL DEFAULT 'other'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "stampDuty" decimal(12,2) NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN IF EXISTS "stampDuty"`);
    await queryRunner.query(`ALTER TABLE "sales_invoices" DROP COLUMN IF EXISTS "paymentMode"`);
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "stampDutyEnabled"`);
  }
}
