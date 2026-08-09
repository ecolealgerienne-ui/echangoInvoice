import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cadre de tableau.
 *
 * Vingt-trois tableaux vivent dans l'application, chacun avec son propre
 * emballage : `rounded-lg border border-border`, `rounded-md overflow-hidden`,
 * `border border-border rounded`, et cinq qui n'en avaient aucun. Ils se
 * ressemblaient assez pour qu'on ne le remarque pas, et différaient assez pour
 * qu'aucune retouche ne les prenne tous.
 *
 * Le composant ne prend pas la main sur les colonnes — un tableau de factures
 * et un tableau de lots n'ont rien de commun à ce niveau, et une abstraction
 * qui aurait décrit les colonnes en objets aurait rendu chaque page plus
 * difficile à lire qu'un `<table>` écrit à la main. Il prend la main sur le
 * **cadre** : la surface, la bordure, le rayon, le débordement, et la classe
 * `ci-tableau` qui déclenche les règles de ligne de `globals.css` — en-tête en
 * creux, séparateurs ténus, hauteur de ligne de 56 px, survol plein.
 *
 * C'est le bon partage : ce qui doit être identique partout est ici, ce qui
 * doit différer reste dans la page.
 *
 * ── `overflow-hidden` et le débordement horizontal ───────────────────────
 *
 * La spécification demande `overflow: hidden` sur le conteneur, pour que les
 * coins arrondis coupent proprement l'en-tête. Mais neuf colonnes ne tiennent
 * pas toujours dans la fenêtre : couper serait rendre des colonnes
 * inatteignables. `defilant` remplace donc la coupe par un défilement
 * horizontal, ce qui garde les coins — un conteneur qui défile rogne aussi son
 * contenu — sans rien perdre.
 */
export function TableConteneur({
  children, defilant = true, dense, className,
}: {
  children: ReactNode;
  /**
   * Défilement horizontal. Vrai par défaut : c'est le cas des listes
   * principales. Les tableaux courts — trois colonnes dans une fiche — passent
   * `false` et se contentent de la coupe.
   */
  defilant?: boolean;
  /**
   * Tableau imbriqué : les lignes gardent leur densité au lieu de monter à
   * 56 px. Les articles d'une facture, l'historique d'un document, les codes-
   * barres d'un lot — soixante lignes à 56 px feraient trois écrans, pour une
   * information qu'on lit d'un bloc et non ligne à ligne.
   */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card',
        !dense && 'ci-tableau',
        defilant ? 'overflow-x-auto' : 'overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Cellule d'en-tête.
 *
 * La couleur, la taille et la graisse viennent de la règle `thead th` de
 * `globals.css` — dix pixels, semi-gras, majuscules, encre tertiaire — pour que
 * les en-têtes écrits à la main dans les pages en héritent aussi. Ne restent
 * ici que le rembourrage et l'alignement, qui, eux, dépendent de la colonne.
 */
export function Th({
  className, aligne = 'start', ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { aligne?: 'start' | 'end' | 'center' }) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 font-semibold',
        aligne === 'end' ? 'text-right' : aligne === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

/** Cellule de corps. Treize pixels, rembourrage horizontal de douze. */
export function Td({
  className, aligne = 'start', ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { aligne?: 'start' | 'end' | 'center' }) {
  return (
    <td
      className={cn(
        'px-3 py-2.5',
        aligne === 'end' ? 'text-right' : aligne === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Nom d'entité dans une liste : douze pixels, semi-gras, encre pleine.
 *
 * C'est la seule colonne d'un tableau qui porte une identité plutôt qu'une
 * mesure, et la spécification lui donne sa propre règle. Sans elle, le nom du
 * client avait exactement le poids de son numéro de registre de commerce, et
 * l'œil ne trouvait plus la ligne qu'il cherchait sans lire toutes les
 * colonnes.
 */
export function NomEntite({ className, children, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('text-xs font-semibold text-foreground', className)} {...props}>
      {children}
    </span>
  );
}
