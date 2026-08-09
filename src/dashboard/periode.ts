import { BadRequestException } from '@nestjs/common';

export interface Periode {
  /** Bornes incluses, au format AAAA-MM-JJ. */
  dateFrom: string;
  dateTo: string;
}

export interface PeriodeAvecComparaison extends Periode {
  /** Période de même durée, immédiatement antérieure. */
  comparaison: Periode;
  /** Nombre de jours couverts, bornes incluses. */
  jours: number;
}

const JOUR_MS = 86_400_000;

function versDate(iso: string): Date {
  // Midi UTC : à minuit, un décalage horaire fait basculer la date d'un jour.
  return new Date(`${iso}T12:00:00Z`);
}

function versIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Jour courant à Alger — `toISOString()` seul est en UTC et bascule trop tôt. */
export function aujourdhuiAlger(): string {
  const p = new Intl.DateTimeFormat('fr-DZ', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** Bornes d'un mois AAAA-MM. */
export function bornesDuMois(mois: string): Periode {
  const [annee, m] = mois.split('-').map(Number);
  const dernierJour = new Date(Date.UTC(annee, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { dateFrom: `${annee}-${mm}-01`, dateTo: `${annee}-${mm}-${String(dernierJour).padStart(2, '0')}` };
}

/**
 * Résout la période demandée et calcule celle à laquelle la comparer.
 *
 * La comparaison est une période de **même durée** collée juste avant : c'est
 * ce qui rend l'écart lisible. Comparer un mois de 28 jours à un mois de 31
 * ferait passer une baisse d'activité pour une saisonnalité, et l'inverse.
 *
 * Ordre de priorité : `from`/`to` explicites, sinon `month`, sinon le mois
 * courant.
 */
export function resoudrePeriode(demande: {
  from?: string; to?: string; month?: string;
}): PeriodeAvecComparaison {
  let base: Periode;

  if (demande.from || demande.to) {
    if (!demande.from || !demande.to) {
      throw new BadRequestException({ message: 'errors.periode_incomplete', field: 'from' });
    }
    base = { dateFrom: demande.from, dateTo: demande.to };
  } else {
    base = bornesDuMois(demande.month ?? aujourdhuiAlger().slice(0, 7));
  }

  const debut = versDate(base.dateFrom);
  const fin = versDate(base.dateTo);
  if (fin.getTime() < debut.getTime()) {
    throw new BadRequestException({ message: 'errors.periode_inversee', field: 'to' });
  }

  const jours = Math.round((fin.getTime() - debut.getTime()) / JOUR_MS) + 1;
  const finComparaison = new Date(debut.getTime() - JOUR_MS);
  const debutComparaison = new Date(finComparaison.getTime() - (jours - 1) * JOUR_MS);

  return {
    ...base,
    jours,
    comparaison: { dateFrom: versIso(debutComparaison), dateTo: versIso(finComparaison) },
  };
}

/**
 * Écart relatif entre deux valeurs, en pourcentage arrondi au dixième.
 *
 * Quand la référence est nulle, aucun pourcentage n'a de sens : « +100 % » et
 * « +∞ » sont tous deux faux, et un 0 ferait croire à une stagnation. On rend
 * `null`, à charge de l'affichage de dire « pas de comparaison possible ».
 */
export function evolution(actuel: number, precedent: number): number | null {
  if (!Number.isFinite(actuel) || !Number.isFinite(precedent) || precedent === 0) return null;
  return Math.round(((actuel - precedent) / Math.abs(precedent)) * 1000) / 10;
}
