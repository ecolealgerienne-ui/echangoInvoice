import { ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Ce qu'on voit quand il n'y a rien à voir.
 *
 * L'application répondait « Aucune donnée » en gris clair, centré, taille du
 * corps de texte. C'est la phrase la plus démoralisante d'un logiciel de
 * gestion : elle ressemble à une panne. Or un écran vide est presque toujours
 * l'un de deux cas très différents — un filtre trop étroit, ou un module qu'on
 * n'a pas encore commencé à utiliser — et dans les deux cas il existe un geste
 * évident que personne ne proposait.
 *
 * D'où : une illustration qui occupe la place au lieu de la laisser béante, une
 * phrase qui dit ce qui manque, et l'action qui manque.
 *
 * L'illustration est dessinée en SVG à partir des jetons, pas chargée comme
 * image. Elle suit donc le thème sans qu'on ait à en fournir deux versions, ne
 * pèse rien, et reste nette sur un écran de chantier comme sur un portable.
 */
export function EtatVide({
  titre, texte, action, compact, className,
}: {
  titre?: string;
  texte?: string;
  action?: ReactNode;
  /** Version resserrée, pour l'intérieur d'une carte de tableau de bord. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-6' : 'gap-3 py-14',
        className,
      )}
    >
      <IllustrationVide className={compact ? 'h-20 w-28' : 'h-32 w-44'} />
      <p className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
        {titre ?? t('common.videTitre')}
      </p>
      <p className={cn('max-w-sm text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
        {texte ?? t('common.videTexte')}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Trois feuillets qui se décalent, une caisse ouverte, un halo derrière.
 *
 * Le vocabulaire du produit tient en deux objets : le document et le lot. Les
 * deux sont là. Le halo est en dégradé radial de la primaire vers rien : il
 * donne du volume sans ajouter une couleur de plus, et il est le seul élément
 * qui bouge — très lentement, pour que l'écran vide ne soit pas un écran mort.
 */
export function IllustrationVide({ className }: { className?: string }) {
  const id = useId();

  return (
    <svg viewBox="0 0 176 128" className={className} role="img" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`halo-${id}`} cx="50%" cy="52%" r="52%">
          <stop offset="0%" stopColor="oklch(var(--ci-primary))" stopOpacity="0.20" />
          <stop offset="100%" stopColor="oklch(var(--ci-primary))" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`feuille-${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="oklch(var(--ci-surface-elevated))" />
          <stop offset="100%" stopColor="oklch(var(--ci-muted))" />
        </linearGradient>
        <linearGradient id={`caisse-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(var(--ci-serie-4))" stopOpacity="0.34" />
          <stop offset="100%" stopColor="oklch(var(--ci-serie-1))" stopOpacity="0.20" />
        </linearGradient>
      </defs>

      <circle cx="88" cy="66" r="62" fill={`url(#halo-${id})`} className="aurore" />

      {/* Deux feuillets en retrait, un en avant : la pile qu'on n'a pas encore. */}
      <g className="animate-entree">
        <rect x="52" y="16" width="52" height="66" rx="6"
          fill={`url(#feuille-${id})`} stroke="oklch(var(--ci-border))" strokeWidth="1.5"
          transform="rotate(-9 78 49)" opacity="0.55" />
        <rect x="66" y="14" width="52" height="66" rx="6"
          fill={`url(#feuille-${id})`} stroke="oklch(var(--ci-border))" strokeWidth="1.5"
          transform="rotate(6 92 47)" opacity="0.75" />
        <rect x="60" y="20" width="54" height="68" rx="7"
          fill="oklch(var(--ci-surface-elevated))" stroke="oklch(var(--ci-border-strong))" strokeWidth="1.5" />
        <path d="M71 38h32M71 48h22M71 58h28M71 68h16"
          stroke="oklch(var(--ci-border-strong))" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      </g>

      {/* La caisse : ouverte, en pointillés — la place est prête, elle est vide. */}
      <g>
        <path d="M34 86h108l-9 26H43z" fill={`url(#caisse-${id})`}
          stroke="oklch(var(--ci-serie-4))" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M34 86l12-14h84l12 14" fill="none"
          stroke="oklch(var(--ci-serie-4))" strokeWidth="1.6" strokeLinejoin="round"
          strokeDasharray="5 5" opacity="0.75" />
      </g>

      {/* Deux étincelles : la promesse que quelque chose peut y entrer. */}
      <circle cx="139" cy="30" r="3.5" fill="oklch(var(--ci-serie-5))" opacity="0.85" className="pulsation" />
      <circle cx="33" cy="48" r="2.5" fill="oklch(var(--ci-serie-6))" opacity="0.7" className="pulsation" />
    </svg>
  );
}
