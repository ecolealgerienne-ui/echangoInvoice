export type Frequence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const FREQUENCES: Frequence[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

const MOIS_AJOUTES: Record<Frequence, number> = {
  weekly: 0, monthly: 1, quarterly: 3, yearly: 12,
};

/**
 * Prochaine échéance d'un abonnement.
 *
 * Le piège est le mois court. Un abonnement calé au 31 doit tomber le 28 en
 * février — et **revenir au 31** en mars, pas rester au 28 : sinon la date
 * dérive vers le début du mois au fil de l'année, et personne ne comprend
 * pourquoi sa facture arrive de plus en plus tôt.
 *
 * Le jour d'ancrage est donc celui de la date de départ, jamais celui de la
 * dernière échéance produite.
 */
export function prochaineEcheance(
  depart: string, frequence: Frequence, courante: string,
): string {
  const [, , jourDepartStr] = depart.split('-');
  const jourAncrage = Number(jourDepartStr);

  const [a, m, j] = courante.split('-').map(Number);

  if (frequence === 'weekly') {
    // Midi UTC : à minuit, un décalage horaire ferait basculer la date.
    const d = new Date(Date.UTC(a, m - 1, j, 12));
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  const pas = MOIS_AJOUTES[frequence];
  const cible = new Date(Date.UTC(a, m - 1 + pas, 1, 12));
  const annee = cible.getUTCFullYear();
  const mois = cible.getUTCMonth();

  // Dernier jour du mois cible : `Date.UTC(a, m + 1, 0)` rend le jour 0 du mois
  // suivant, c'est-à-dire le dernier du mois visé.
  const dernierJour = new Date(Date.UTC(annee, mois + 1, 0, 12)).getUTCDate();
  const jour = Math.min(jourAncrage, dernierJour);

  return `${annee}-${String(mois + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** Un abonnement est dû quand son échéance est atteinte et qu'il n'est pas terminé. */
export function estDue(nextRunDate: string, endDate: string | null, aujourdhui: string): boolean {
  if (nextRunDate > aujourdhui) return false;
  if (endDate && nextRunDate > endDate) return false;
  return true;
}
