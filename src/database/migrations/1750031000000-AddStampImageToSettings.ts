import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cachet et signature de l'émetteur sur les documents.
 *
 * Le décret 05-468 les exige, sauf transmission télématique
 * (docs/CONFORMITE-FISCALE.md §7). Un emplacement vide sur le PDF ne suffit
 * pas : ce qui circule est souvent un fichier, pas un papier qu'on tamponne.
 */
export class AddStampImageToSettings1750031000000 implements MigrationInterface {
  name = 'AddStampImageToSettings1750031000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "stampImage" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN IF EXISTS "stampImage"`);
  }
}
