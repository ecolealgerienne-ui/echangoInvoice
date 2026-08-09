import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Champ de saisie.
 *
 * Trente-six pixels de haut, douze de rembourrage, huit de rayon, et le fond
 * **en creux** : `bg-champ` est plus sombre que la carte en thème sombre et
 * plus sombre que le blanc en thème clair. C'est le seul moyen de donner une
 * forme à un champ sans l'entourer d'un trait épais — un champ de la couleur
 * exacte de la surface derrière lui n'a plus de contour, et l'œil ne trouve
 * plus où cliquer.
 *
 * Il prenait auparavant `bg-surface`, c'est-à-dire la couleur de la carte : le
 * champ et son contenant étaient identiques, et seule une bordure d'un pixel
 * les séparait.
 *
 * Le focus pose deux signaux : la bordure passe à la primaire, et un anneau de
 * deux pixels à 12 % l'entoure. Deux, parce qu'un seul disparaît selon le fond
 * sur lequel le champ est posé.
 */
const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        [
          'flex h-9 w-full rounded-md border border-input bg-champ px-3 text-sm text-foreground',
          'transition-[border-color,box-shadow] duration-150',
          'placeholder:text-axe',
          'hover:border-border-strong',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/[0.12]',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
          // Les champs numériques alignent leurs chiffres comme les colonnes.
          '[&[type=number]]:tabular-nums',
        ].join(' '),
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
