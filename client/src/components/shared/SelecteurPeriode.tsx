import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export interface Periode {
  from: string;
  to: string;
}

/** Le jour à Alger, pas en UTC : à minuit passé, l'UTC désigne encore la veille. */
function aujourdhui(): Date {
  const p = new Intl.DateTimeFormat('fr-DZ', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const v = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return new Date(Date.UTC(v('year'), v('month') - 1, v('day'), 12));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function decalerJours(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

type CleRaccourci = 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee' | 'douzeMois';

/**
 * Chaque raccourci rend ses bornes. Le calcul vit ici et pas dans la page :
 * c'est la même définition de « ce mois-ci » qui doit servir partout où on
 * l'affichera.
 */
const RACCOURCIS: Record<CleRaccourci, () => Periode> = {
  jour: () => {
    const j = aujourdhui();
    return { from: iso(j), to: iso(j) };
  },
  semaine: () => {
    const j = aujourdhui();
    // Semaine commençant lundi : getUTCDay rend 0 pour dimanche.
    const jourSemaine = (j.getUTCDay() + 6) % 7;
    return { from: iso(decalerJours(j, -jourSemaine)), to: iso(j) };
  },
  mois: () => {
    const j = aujourdhui();
    return { from: iso(new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), 1, 12))), to: iso(j) };
  },
  trimestre: () => {
    const j = aujourdhui();
    const debutTrimestre = Math.floor(j.getUTCMonth() / 3) * 3;
    return { from: iso(new Date(Date.UTC(j.getUTCFullYear(), debutTrimestre, 1, 12))), to: iso(j) };
  },
  annee: () => {
    const j = aujourdhui();
    return { from: iso(new Date(Date.UTC(j.getUTCFullYear(), 0, 1, 12))), to: iso(j) };
  },
  douzeMois: () => {
    const j = aujourdhui();
    return { from: iso(new Date(Date.UTC(j.getUTCFullYear() - 1, j.getUTCMonth(), j.getUTCDate(), 12))), to: iso(j) };
  },
};

const ORDRE: CleRaccourci[] = ['jour', 'semaine', 'mois', 'trimestre', 'annee', 'douzeMois'];

export function periodeParDefaut(): Periode {
  return RACCOURCIS.mois();
}

export function SelecteurPeriode({ valeur, onChange }: {
  valeur: Periode;
  onChange: (p: Periode) => void;
}) {
  const { t } = useTranslation();
  const [personnalise, setPersonnalise] = useState(false);

  const actif = (cle: CleRaccourci) => {
    const p = RACCOURCIS[cle]();
    return !personnalise && p.from === valeur.from && p.to === valeur.to;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-border overflow-hidden text-sm">
        {ORDRE.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => { setPersonnalise(false); onChange(RACCOURCIS[cle]()); }}
            className={cn(
              'px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              actif(cle) ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`dashboard.periode.${cle}`)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPersonnalise(true)}
          className={cn(
            'px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            personnalise ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {t('dashboard.periode.personnalisee')}
        </button>
      </div>

      {personnalise && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={valeur.from}
            max={valeur.to}
            onChange={(e) => onChange({ ...valeur, from: e.target.value })}
            className="h-9 w-40"
          />
          <span className="text-sm text-muted-foreground">→</span>
          <Input
            type="date"
            value={valeur.to}
            min={valeur.from}
            onChange={(e) => onChange({ ...valeur, to: e.target.value })}
            className="h-9 w-40"
          />
        </div>
      )}
    </div>
  );
}
