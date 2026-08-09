import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Bornes d'entrée, nommées une fois et alignées sur les colonnes (R021).
 *
 * Ce que la base refuse, l'entrée doit le refuser d'abord : sans ces bornes,
 * une valeur hors limites atteint Postgres, qui lève `22003 numeric field
 * overflow` — l'utilisateur reçoit un 500 là où un 422 était dû.
 *
 * Les trois familles correspondent aux précisions réellement en base :
 *   numeric(5, 2)   les taux            → 999.99, mais bornés à 100 par le métier
 *   numeric(10, 2)  quantités, prix U.  → 99 999 999.99
 *   numeric(12, 2)  montants agrégés    → 9 999 999 999.99
 */

/** numeric(12, 2) — subtotal, taxAmount, totalAmount, amountDue, lineTotal… */
export const MONTANT_MAX = 9_999_999_999.99;

/** numeric(10, 2) — quantity, unitPrice, costPerUnit, stockQuantity… */
export const QUANTITE_MAX = 99_999_999.99;

/** Idem quantité : `unitPrice` est en numeric(10, 2) dans les tables d'achat,
 *  en (12, 2) ailleurs. On retient la plus contraignante des deux. */
export const PRIX_MAX = QUANTITE_MAX;

/** numeric(5, 2), mais un taux de TVA est un pourcentage. */
export const TAUX_MAX = 100;

/** varchar(255) — la longueur la plus fréquente pour les champs courts. */
export const TEXTE_COURT_MAX = 255;

/** Colonnes `text` : pas de limite en base, mais une entrée non bornée reste
 *  un vecteur de charge utile démesurée. */
export const TEXTE_LONG_MAX = 2000;

/**
 * Vérifie qu'un montant calculé tient dans `numeric(12, 2)`.
 *
 * Borner chaque champ à sa colonne ne suffit pas : une quantité et un prix
 * tous deux valides peuvent produire un total qui déborde. C'est le produit
 * qu'il faut contrôler, au moment où il est calculé.
 *
 * `Number.isFinite` d'abord, jamais supposé : `NaN <= max` et `NaN > min` sont
 * tous les deux faux, donc une comparaison seule laisserait passer un NaN.
 */
export function assertMontant(valeur: number, champ = 'amount'): number {
  if (!Number.isFinite(valeur)) {
    throw new UnprocessableEntityException({
      message: 'errors.amount_not_finite',
      field: champ,
    });
  }
  if (Math.abs(valeur) > MONTANT_MAX) {
    throw new UnprocessableEntityException({
      message: 'errors.amount_out_of_range',
      field: champ,
    });
  }
  return valeur;
}
