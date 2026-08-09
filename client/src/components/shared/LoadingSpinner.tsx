import { cn } from '@/lib/utils';

/**
 * Attente courte.
 *
 * L'anneau était gris, avec un quart bleu : la forme universelle du « ça
 * charge », et la moins informative qui soit. Il reste utile là où l'attente
 * est brève et localisée — un bouton, une modale — mais partout où l'on attend
 * une **page**, ce sont les squelettes de `Squelette.tsx` qui prennent le
 * relais : eux tiennent la place de ce qui vient.
 *
 * Deux anneaux superposés, tournant à des vitesses différentes, sur les deux
 * extrémités du dégradé de marque. La différence de vitesse est ce qui donne à
 * l'attente une texture : un anneau seul tourne, deux anneaux respirent.
 */
export function LoadingSpinner({ className, size }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8';
  const wrap = size === 'sm' ? '' : 'flex items-center justify-center py-12';

  return (
    <div className={cn(wrap, className)} role="status">
      <div className={cn('relative', dim)}>
        <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-border border-t-serie-1" />
        <div
          className="absolute inset-[3px] animate-spin rounded-full border-[3px] border-transparent border-b-serie-4"
          style={{ animationDuration: '1.6s', animationDirection: 'reverse' }}
        />
      </div>
    </div>
  );
}
