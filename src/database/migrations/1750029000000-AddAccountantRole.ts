import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rôle « comptable », en lecture seule.
 *
 * Le cabinet comptable est le prescripteur du logiciel en Algérie : il doit
 * pouvoir consulter et exporter sans risquer de modifier une pièce. Les trois
 * rôles existants donnent tous au moins un droit d'écriture.
 *
 * `ADD VALUE` sur un type énuméré est irréversible en PostgreSQL — une valeur
 * ne se retire pas d'un enum. Le `down` remet donc la colonne en état
 * seulement si personne ne porte le rôle ; sinon il refuse, plutôt que de
 * réaffecter arbitrairement des comptes.
 */
export class AddAccountantRole1750029000000 implements MigrationInterface {
  name = 'AddAccountantRole1750029000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'accountant'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'accountant'`,
    );
    if (count > 0) {
      throw new Error(
        `Impossible d'annuler : ${count} compte(s) portent le rôle « comptable ». `
        + `Les réaffecter d'abord, puis relancer.`,
      );
    }
    // La valeur reste dans le type : PostgreSQL ne sait pas la retirer. Le
    // dire plutôt que de laisser croire à une annulation complète.
  }
}
