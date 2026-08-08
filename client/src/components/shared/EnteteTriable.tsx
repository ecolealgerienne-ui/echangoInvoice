import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * En-tête de colonne triable.
 *
 * L'icône est toujours présente, en gris tant que la colonne n'est pas celle
 * qui trie : sans elle, rien ne distingue une colonne triable d'une colonne
 * qui ne l'est pas, et l'utilisateur clique au hasard.
 */
export function EnteteTriable({
  libelle, colonne, tri, onTrier, ariaSort, droite,
}: {
  libelle: string;
  colonne: string;
  tri: { sortBy: string; sortOrder: 'ASC' | 'DESC' };
  onTrier: (colonne: any) => void;
  ariaSort: (colonne: any) => 'ascending' | 'descending' | 'none';
  droite?: boolean;
}) {
  const actif = tri.sortBy === colonne;
  const Icone = !actif ? ChevronsUpDown : tri.sortOrder === 'ASC' ? ChevronUp : ChevronDown;

  return (
    <th
      aria-sort={ariaSort(colonne)}
      className={cn('px-4 py-3 font-medium text-muted-foreground', droite ? 'text-right' : 'text-left')}
    >
      <button
        type="button"
        onClick={() => onTrier(colonne)}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm hover:text-foreground transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          droite && 'flex-row-reverse',
          actif && 'text-foreground font-semibold',
        )}
      >
        {libelle}
        <Icone className={cn('h-3.5 w-3.5 shrink-0', !actif && 'opacity-40')} />
      </button>
    </th>
  );
}
