import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identifiants légaux de l'émetteur, coordonnées bancaires et couleur des
 * documents.
 *
 * Les PDF affichaient « NIF : | RC : » vides sur chaque facture — non par
 * oubli d'affichage, mais parce que la requête sélectionnait littéralement
 * `NULL AS company_nif`. Les colonnes n'existaient pas : il n'y avait nulle
 * part où saisir le NIF de sa propre entreprise, alors qu'une facture
 * algérienne sans NIF ni RC n'est pas recevable.
 */
export class AddCompanyLegalIdsToSettings1750025000000 implements MigrationInterface {
  name = 'AddCompanyLegalIdsToSettings1750025000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const colonnes: [string, string][] = [
      ['nif', 'varchar(50)'],
      ['rc', 'varchar(50)'],
      ['ai', 'varchar(50)'],
      ['nis', 'varchar(50)'],
      // Le RIB figure sur la plupart des factures algériennes : sans lui, le
      // client rappelle pour demander où virer.
      ['rib', 'varchar(60)'],
    ];
    for (const [nom, type] of colonnes) {
      await queryRunner.query(
        `ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "${nom}" ${type}`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "settings"
       ADD COLUMN IF NOT EXISTS "pdfAccentColor" varchar(7) NOT NULL DEFAULT '#1e3a5f'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const nom of ['nif', 'rc', 'ai', 'nis', 'rib', 'pdfAccentColor']) {
      await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "${nom}"`);
    }
  }
}
