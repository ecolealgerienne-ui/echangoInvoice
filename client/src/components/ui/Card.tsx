import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte.
 *
 * En clair, l'élévation vient de l'ombre et de l'écart de clarté avec la page
 * — le fond est désormais teinté à L 0.972 quand la carte reste à 0.999, alors
 * que les deux valaient pratiquement blanc auparavant. En sombre, elle vient
 * de la clarté seule : la carte est de 7 % plus claire que le fond. C'est le
 * même composant, mais le signal de profondeur change de nature avec le thème,
 * et c'est le jeton qui s'en charge.
 *
 * Deux réglages ont été ajoutés avec la direction « Azur & Ambre » :
 *
 * - `vivante` — la carte se soulève de deux pixels au survol et son ombre
 *   s'ouvre. Réservée aux cartes sur lesquelles on peut agir : une carte
 *   d'information qui bouge sous le curseur promet un clic qui n'existe pas.
 *
 * - `voile` — un dégradé de marque à 5 % posé en diagonale depuis le coin
 *   haut. Assez pour que la surface ait une direction et ne soit plus une
 *   plaque, trop peu pour se lire comme une couleur.
 */
interface ProprietesCarte extends HTMLAttributes<HTMLDivElement> {
  vivante?: boolean;
  voile?: boolean;
}

const Card = forwardRef<HTMLDivElement, ProprietesCarte>(
  ({ className, vivante, voile, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        voile && 'voile-marque',
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
    <div ref={ref} className={cn('flex flex-col space-y-1 p-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('text-sm font-semibold leading-none text-foreground', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
