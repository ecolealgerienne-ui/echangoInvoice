import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte.
 *
 * C'est la surface de base du système : `bg-card`, une bordure d'un pixel, dix
 * pixels de rayon, quatorze de rembourrage. Rien d'autre — et surtout pas
 * d'ombre par défaut.
 *
 * L'absence d'ombre est une décision, pas un oubli. Le détachement vient de
 * trois choses qui suffisent : la carte est plus claire que la page en sombre
 * (L 0.202 contre 0.167) et plus claire encore en clair (0.999 contre 0.964),
 * elle porte une bordure, et l'espacement autour d'elle est franc. Une ombre
 * par-dessus tout cela n'ajoute que du flou — et en sombre, une ombre noire sur
 * un fond presque noir n'existe simplement pas. `ombre` la rend là où une carte
 * flotte réellement au-dessus d'une autre.
 *
 * Un réglage reste, `vivante` : la carte est cliquable, et sa bordure
 * s'éclaircit au survol. **Elle ne se déplace pas** — une grille de douze
 * cartes dont la moitié se soulève au passage du curseur donne l'impression
 * que la page respire mal. Le mouvement appartient au bouton, seul objet qu'on
 * vise vraiment.
 *
 * Un troisième réglage a été retiré : `voile`, un dégradé de marque à 5 % posé
 * en diagonale depuis le coin haut. Il donnait une direction à une surface qui
 * n'en avait pas, quand la carte était un blanc parfait posé sur un blanc
 * presque identique. Le nouveau fond de carte porte sa propre teinte, et le
 * voile n'ajoutait plus qu'un lavis bleu dans un coin.
 */
interface ProprietesCarte extends HTMLAttributes<HTMLDivElement> {
  vivante?: boolean;
  /** Ombre de carte, pour les surfaces réellement superposées. */
  ombre?: boolean;
}

const Card = forwardRef<HTMLDivElement, ProprietesCarte>(
  ({ className, vivante, ombre, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-lg border border-border bg-card text-card-foreground',
        ombre && 'shadow-md',
        vivante && 'carte-vivante',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 p-3.5', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

/**
 * Titre de carte : douze pixels, semi-gras, encre pleine.
 *
 * Il était à treize et de la même graisse que le corps qu'il surmonte, ce qui
 * revenait à ne pas avoir de titre. La hiérarchie ne passe pas par la couleur
 * ici — un titre gris sur une carte grise se perd — mais par le couple
 * taille + graisse, le seul qui tienne dans les deux thèmes.
 */
const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-xs font-semibold leading-none text-foreground', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-3.5 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
