import { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * Squelettes de chargement.
 *
 * Le tableau de bord affichait un disque qui tourne au milieu d'une page vide.
 * Un disque ne dit rien : ni combien de temps, ni ce qui arrive, ni où
 * regarder ensuite. Et il fait disparaître la page — au retour des données,
 * tout apparaît d'un coup et l'œil doit refaire le trajet depuis le début.
 *
 * Un squelette dit les trois : il tient la place exacte de ce qui vient, dans
 * la forme exacte de ce qui vient. La mise en page ne bouge pas quand les
 * données arrivent, et le regard est déjà posé au bon endroit.
 *
 * Le reflet qui traverse (`miroitement`, défini dans `globals.css`) a un sens
 * de lecture — il va de gauche à droite, et s'inverse en arabe. Un
 * clignotement d'opacité, lui, ne dit rien et fatigue au bout de dix secondes.
 */
export function Squelette({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn('miroitement rounded-md bg-muted', className)}
    />
  );
}

/** Squelette d'une carte d'indicateur : pastille, intitulé, montant, écart. */
export function SqueletteIndicateur() {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2.5">
          <Squelette className="h-2.5 w-24" />
          <Squelette className="h-6 w-36" />
          <Squelette className="h-2 w-20" />
        </div>
        <Squelette className="h-11 w-11 rounded-xl" />
      </div>
    </div>
  );
}

/** Squelette d'une carte de contenu : titre puis quelques lignes. */
export function SqueletteCarte({ lignes = 4 }: { lignes?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <Squelette className="mb-4 h-3 w-32" />
      <div className="space-y-2.5">
        {Array.from({ length: lignes }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Squelette className="h-2.5 flex-1" style={{ maxWidth: `${58 - i * 6}%` }} />
            <Squelette className="h-2.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Squelette d'un graphique : la silhouette d'une courbe, pas un rectangle. */
export function SqueletteGraphique({ hauteur = 180 }: { hauteur?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <Squelette className="mb-4 h-3 w-28" />
      <Squelette className="mb-3 h-6 w-40" />
      <div className="flex items-end gap-1.5" style={{ height: hauteur }}>
        {[38, 62, 46, 78, 54, 88, 66, 94, 72, 58, 84, 68].map((h, i) => (
          <Squelette key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
