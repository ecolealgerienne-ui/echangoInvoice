import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Bouton.
 *
 * Trente-quatre pixels de haut, quatorze de rembourrage horizontal, huit de
 * rayon, douze pixels de texte en semi-gras. C'est court, et c'est voulu : sur
 * un écran de saisie, un bouton de quarante pixels de haut à côté d'un champ de
 * trente-six casse la ligne de base de la barre d'outils.
 *
 * ── Ce qui a été retiré, et pourquoi ─────────────────────────────────────
 *
 * Le bouton portait un **dégradé vertical** et une **ombre colorée**, les deux
 * ajoutés pour le faire « rayonner ». La spécification les supprime, et le
 * gain est réel : l'aplat plein de `#1677FF` est déjà la couleur la plus
 * saturée de l'écran — le dosage lui réserve 20 % de la surface — et lui
 * ajouter une lueur revenait à monter le volume d'une voix déjà seule à
 * parler. L'état se lit maintenant par la couleur seule : `primary` au repos,
 * `primary-hover` au survol, `primary-active` à la pression.
 *
 * La bordure est de la **même couleur que le fond**. Ce n'est pas décoratif :
 * sans elle, un bouton plein et un bouton contour posés côte à côte n'ont pas
 * la même hauteur de boîte, et la ligne se décale d'un pixel.
 *
 * Le soulèvement d'un pixel au survol reste — c'est le seul mouvement autorisé
 * par la spécification, et il ne s'applique qu'à ce qu'on vise réellement.
 */
const buttonVariants = cva(
  [
    'group/bouton relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border',
    'text-xs font-semibold select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-ci',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'motion-safe:active:translate-y-0',
    '[&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'border-primary bg-primary text-primary-foreground',
          'hover:border-primary-hover hover:bg-primary-hover',
          'active:border-primary-active active:bg-primary-active',
          'motion-safe:hover:-translate-y-px',
        ].join(' '),
        destructive: [
          'border-destructive bg-destructive text-destructive-foreground',
          'hover:brightness-110 motion-safe:hover:-translate-y-px',
        ].join(' '),
        // Le bouton secondaire : la surface de la carte, la bordure du système,
        // et une encre un cran sous l'encre pleine — assez pour qu'il ne
        // dispute pas le regard au bouton principal, assez pour se lire.
        outline: 'border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover',
        ghost: 'border-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        secondary: 'border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[34px] px-3.5 [&_svg]:size-4',
        sm: 'h-[30px] px-2.5 [&_svg]:size-3.5',
        lg: 'h-10 px-5 text-sm [&_svg]:size-4',
        icon: 'h-[34px] w-[34px] px-0 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
