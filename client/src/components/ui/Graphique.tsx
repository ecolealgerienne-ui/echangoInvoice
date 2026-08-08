import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Graphiques.
 *
 * Le tableau de bord n'en avait aucun : ce que l'écran appelait « CA par jour »
 * était une rangée de `div` colorés à hauteur variable, sans axe, sans grille,
 * sans échelle. On y voyait qu'un jour dépassait un autre, jamais de combien ni
 * à quelle date — c'est-à-dire rien de ce qu'on demande à un graphique.
 *
 * Écrits en SVG plutôt qu'avec une bibliothèque, pour trois raisons :
 *
 * - **le thème.** Les couleurs viennent des jetons via `currentColor` et des
 *   variables CSS ; une bibliothèque impose ses palettes et il faut ensuite les
 *   traduire dans les deux thèmes à la main ;
 * - **le poids.** Le paquet client dépasse déjà le mégaoctet ; Recharts en
 *   ajouterait plus de cent kilo-octets pour trois graphiques ;
 * - **le hors-ligne.** L'application est utilisée en mobilité, et tout ce qui
 *   est embarqué ici l'est pour de bon.
 *
 * Parti pris de rendu, tiré de ce que font les tableaux de bord financiers :
 * grille horizontale seulement et très ténue — les verticales n'aident jamais à
 * comparer des hauteurs —, dernier point marqué puisque c'est celui qu'on
 * cherche, et aucune légende quand il n'y a qu'une série à lire.
 */

export interface PointGraphique {
  /** Étiquette de l'axe horizontal (date déjà formatée). */
  libelle: string;
  valeur: number;
}

interface ProprietesCourbe {
  points: PointGraphique[];
  /** Formatage de la valeur lue. */
  format: (v: number) => string;
  hauteur?: number;
  className?: string;
}

/** Arrondit la borne haute pour que les graduations tombent juste. */
function borneHaute(max: number): number {
  if (max <= 0) return 1;
  const puissance = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / puissance) * puissance;
}

/**
 * Graduation abrégée : « 5,0 M » plutôt que « 5 000 000,00 DA ».
 *
 * Un axe n'est pas un total : il donne l'ordre de grandeur, et le montant exact
 * se lit sur le point survolé. Écrit en entier, il occupait quatre centimètres
 * de gouttière, se coupait en deux lignes, et poussait la courbe hors du cadre.
 */
function abrege(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1).replace('.', ',')} Md`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} M`;
  if (abs >= 1e3) return `${Math.round(v / 1e3)} k`;
  return String(Math.round(v));
}

/**
 * Courbe d'aire.
 *
 * La ligne dit la tendance, l'aire dit le volume. Les deux ensemble se lisent
 * d'un coup d'œil là où une ligne seule oblige à suivre du regard.
 */
export function CourbeAire({ points, format, hauteur = 180, className }: ProprietesCourbe) {
  const id = useId();
  const [survole, setSurvole] = useState<number | null>(null);

  const { chemin, aire, coords, max, graduations } = useMemo(() => {
    const L = 100;
    const H = 100;
    const maxBrut = Math.max(...points.map((p) => p.valeur), 0);
    const m = borneHaute(maxBrut);
    // Un seul point ne trace pas de ligne : on le pose au centre.
    const x = (i: number) => (points.length <= 1 ? L / 2 : (i / (points.length - 1)) * L);
    const y = (v: number) => H - (v / m) * H;
    const c = points.map((p, i) => ({ x: x(i), y: y(p.valeur), ...p }));
    return {
      max: m,
      coords: c,
      chemin: c.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
      aire: c.length
        ? `M${c[0].x.toFixed(2)},${H} ${c.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} L${c[c.length - 1].x.toFixed(2)},${H} Z`
        : '',
      graduations: [0, 0.5, 1].map((f) => ({ f, valeur: m * (1 - f) })),
    };
  }, [points]);

  if (!points.length) return null;
  const actif = survole !== null ? coords[survole] : coords[coords.length - 1];

  return (
    <div className={cn('space-y-3', className)}>
      {/* La valeur lue est posée **au-dessus** du graphique, comme sur les
          tableaux de bord financiers : c'est le chiffre qu'on vient chercher,
          il doit être le premier lu. Sous la courbe, il entrait en collision
          avec la dernière graduation de l'axe. */}
      {actif && (
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {format(actif.valeur)}
          </span>
          <span className="text-xs text-muted-foreground">{actif.libelle}</span>
        </div>
      )}

      <div className="relative">
        {/* Graduations, posées en HTML plutôt que dans le SVG : le texte garde
            ainsi sa taille réelle au lieu d'être étiré par le viewBox. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {graduations.map((g) => (
            <div key={g.f} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-muted-foreground/60">
                {abrege(g.valeur)}
              </span>
              <span className="h-px flex-1 bg-border/50" />
            </div>
          ))}
        </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="ml-12 block w-[calc(100%-3rem)]"
        style={{ height: hauteur }}
        role="img"
        aria-label={`Évolution, maximum ${format(max)}`}
      >
        <defs>
          <linearGradient id={`aire-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="text-primary">
          <path d={aire} fill={`url(#aire-${id})`} />
          {/* `vectorEffect` garde l'épaisseur constante malgré l'étirement du
              viewBox : sans lui, un graphique large donne un trait écrasé. */}
          <path
            d={chemin}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>

        {/* Zones de survol : une bande par point, pour que la lecture s'attrape
            sans viser le pixel exact de la courbe. */}
        <div className="absolute inset-y-0 left-12 right-0 flex">
          {coords.map((p, i) => (
            <button
              key={p.libelle}
              type="button"
              className="h-full flex-1 focus-visible:outline-none"
              onMouseEnter={() => setSurvole(i)}
              onFocus={() => setSurvole(i)}
              onMouseLeave={() => setSurvole(null)}
              onBlur={() => setSurvole(null)}
              aria-label={`${p.libelle} : ${format(p.valeur)}`}
            >
              {survole === i && (
                <span className="block h-full w-px bg-primary/50" aria-hidden />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bornes de la période, seules étiquettes horizontales utiles : les
          dates intermédiaires se lisent au survol. */}
      {coords.length > 1 && (
        <div className="flex justify-between pl-12 text-2xs text-muted-foreground/70">
          <span>{coords[0].libelle}</span>
          <span>{coords[coords.length - 1].libelle}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Sparkline : la même tendance, réduite à sa plus simple expression.
 *
 * Ni axe ni graduation — placée dans une carte d'indicateur, elle répond à une
 * seule question : est-ce que ça monte ou est-ce que ça descend. Tout le reste
 * y serait du bruit.
 */
export function Sparkline({
  valeurs, className, positif = true,
}: { valeurs: number[]; className?: string; positif?: boolean }) {
  const chemin = useMemo(() => {
    if (valeurs.length < 2) return '';
    const max = Math.max(...valeurs);
    const min = Math.min(...valeurs);
    const amplitude = max - min || 1;
    return valeurs
      .map((v, i) => {
        const x = (i / (valeurs.length - 1)) * 100;
        const y = 100 - ((v - min) / amplitude) * 100;
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [valeurs]);

  if (!chemin) return null;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      className={cn('h-8 w-full', positif ? 'text-success' : 'text-destructive', className)}
    >
      <path
        d={chemin}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Barres horizontales avec leur valeur.
 *
 * Préférées aux barres verticales pour les classements : un nom de client tient
 * sur la ligne, là qu'une barre verticale l'obligerait à s'incliner. Le
 * classement se lit de haut en bas, comme un texte.
 */
export function BarresClassement({
  lignes, format, className,
}: {
  lignes: { libelle: string; valeur: number }[];
  format: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(...lignes.map((l) => l.valeur), 0) || 1;
  return (
    <div className={cn('space-y-2.5', className)}>
      {lignes.map((l) => (
        <div key={l.libelle} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">{l.libelle}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {format(l.valeur)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${(l.valeur / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
