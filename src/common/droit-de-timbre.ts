/**
 * Droit de timbre — article 100 du code du timbre.
 *
 * Barème et règles repris de `docs/CONFORMITE-FISCALE.md` §2, qui le classe
 * premier écart de conformité : sans lui, l'outil ne sait pas produire une
 * facture correcte pour une vente au comptant.
 *
 *   ≤ 300 DA          exonéré
 *   301 – 30 000      1 DA par tranche de 100 DA entamée   (≈ 1 %)
 *   30 001 – 100 000  1,50 DA par tranche                  (≈ 1,5 %)
 *   > 100 000         2 DA par tranche                     (≈ 2 %)
 *   minimum de perception : 5 DA
 *
 * Deux points sur lesquels il est facile de se tromper :
 *   - le barème n'est **pas progressif** : le taux est déterminé par la tranche
 *     où tombe le montant TOTAL, puis appliqué à toutes les tranches ;
 *   - la tranche entamée compte en entier (arrondi supérieur).
 *
 * L'exonération des règlements électroniques (art. 47 de la loi de finances
 * 2025) est ce qui rend la fonction nécessaire plutôt que décorative : le
 * montant à payer dépend du mode de règlement.
 */

/** Modes de règlement soumis au droit de timbre — les autres en sont dispensés. */
export const MODES_SOUMIS_AU_TIMBRE = ['cash'] as const;

/** Mention à porter sur la facture à côté du montant (§2 de l'étude). */
export const MENTION_TIMBRE = 'Timbre perçu au profit du trésor';

const SEUIL_EXONERATION = 300;
const MINIMUM_PERCEPTION = 5;
const TAILLE_TRANCHE = 100;

/** Bornes hautes incluses ; `Infinity` pour la dernière. */
const BAREME: { plafond: number; droitParTranche: number }[] = [
  { plafond: 30_000, droitParTranche: 1 },
  { plafond: 100_000, droitParTranche: 1.5 },
  { plafond: Infinity, droitParTranche: 2 },
];

export function estSoumisAuTimbre(modeReglement: string | null | undefined): boolean {
  return (MODES_SOUMIS_AU_TIMBRE as readonly string[]).includes(modeReglement ?? '');
}

/** Droit de timbre dû sur un montant réglé en espèces, en dinars. */
export function calculerDroitDeTimbre(montantBrut: number | string): number {
  const montant = Number(montantBrut);
  // R021 — NaN traverse toutes les comparaisons : l'établir avant de comparer.
  if (!Number.isFinite(montant) || montant <= 0) return 0;
  if (montant < SEUIL_EXONERATION) return 0;

  const tranche = BAREME.find((b) => montant <= b.plafond)!;
  const nbTranches = Math.ceil(montant / TAILLE_TRANCHE);
  const droit = nbTranches * tranche.droitParTranche;

  return Math.round(Math.max(droit, MINIMUM_PERCEPTION) * 100) / 100;
}

/**
 * Net à payer = TTC + droit de timbre.
 *
 * Un seul endroit : `amountDue` se calculait à la création et à la
 * modification de la facture, et les deux devaient rester d'accord.
 */
export function calculerNetAPayer(totalTTC: number | string, droitDeTimbre: number | string): number {
  return Math.round((Number(totalTTC) + Number(droitDeTimbre)) * 100) / 100;
}
