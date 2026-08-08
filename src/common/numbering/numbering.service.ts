import { Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { DOCUMENTS, TypeDocument, appliquerFormat } from './document-kinds';

@Injectable()
export class NumberingService {
  /**
   * Rend le prochain numéro d'un document et consomme la séquence.
   *
   * À appeler DANS la transaction qui insère le document : le compteur est
   * incrémenté par la même transaction, donc un échec plus loin le rend à
   * l'état antérieur. Un compteur avancé pour un document jamais créé ferait
   * un trou dans la numérotation — ce qu'un contrôle fiscal remarque.
   *
   * `INSERT … ON CONFLICT DO UPDATE … RETURNING` fait l'incrément en un seul
   * aller-retour et pose le verrou de ligne au passage : deux factures créées
   * simultanément ne peuvent pas obtenir le même numéro, sans qu'on ait besoin
   * du verrou consultatif que prenait chacune des huit anciennes méthodes.
   */
  async prochain(qr: QueryRunner, tenantId: string, type: TypeDocument): Promise<string> {
    const maintenant = new Date();
    const format = await this.format(qr, tenantId, type);

    // La séquence ne repart à 1 au 1er janvier QUE si le format porte l'année.
    // Sans ce test, un format tel que « FAC-### » aurait produit FAC-001 le
    // 1er janvier suivant — un numéro déjà émis l'année précédente. L'index
    // unique l'aurait refusé, et la première facture de l'année serait tombée
    // en erreur. Le droit algérien impose une numérotation continue par
    // exercice (décret exécutif 05-468) : sans marqueur d'année dans le
    // numéro, la continuité doit être perpétuelle.
    const porteLAnnee = /YY/.test(format);
    const cle = porteLAnnee ? maintenant.getFullYear() : 0;

    const [compteur] = await qr.query(
      `INSERT INTO document_counters ("tenantId", "kind", "year", "lastValue")
       VALUES ($1, $2, $3, 1)
       ON CONFLICT ("tenantId", "kind", "year") DO UPDATE
         SET "lastValue" = document_counters."lastValue" + 1,
             "updatedAt" = now()
       RETURNING "lastValue"`,
      [tenantId, type, cle],
    );

    return appliquerFormat(format, compteur.lastValue, maintenant);
  }

  /**
   * Format en vigueur pour ce locataire, ou le format historique du produit.
   *
   * Le repli n'est pas décoratif : `settings` n'a pas de ligne tant que
   * l'utilisateur n'a rien enregistré, et une facture doit pouvoir être émise
   * avant d'être allé dans les Paramètres.
   */
  private async format(qr: QueryRunner, tenantId: string, type: TypeDocument): Promise<string> {
    const { reglage, defaut } = DOCUMENTS[type];
    const [ligne] = await qr.query(
      `SELECT "${reglage}" AS format FROM settings WHERE "tenantId" = $1`,
      [tenantId],
    );
    const format = ligne?.format as string | undefined;
    return format && format.trim() !== '' ? format : defaut;
  }
}
