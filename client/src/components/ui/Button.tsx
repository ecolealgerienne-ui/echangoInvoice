import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Bouton.
 *
 * Il portait un aplat de bleu nuit et rien d'autre. Sur un écran où l'on
 * enchaîne les saisies, le bouton principal est le seul objet qu'on cherche du
 * regard : il doit se voir avant d'être lu. Quatre choses le rendent vivant
 * sans le rendre bruyant.
 *
 * - **Un dégradé vertical très court** — de la primaire vers son survol, soit
 *   six centièmes de clarté. Ce n'est pas un effet : c'est ce qui donne au
 *   bouton une arête haute et une assise, là où un aplat parfait paraît collé
 *   sur la page. La couleur de fond pleine est **aussi** posée, sous le
 *   dégradé : un élément qui n'aurait qu'un `background-image` n'a pas de
 *   couleur de fond calculable, et tous les contrôles de contraste — le nôtre
 *   comme celui du navigateur — remonteraient au parent pour mesurer le texte.
 *
 * - **Une ombre colorée** (`shadow-halo`), la seule de l'application. Une ombre
 *   grise sous un bouton bleu le décolle du fond ; une ombre de sa propre
 *   teinte le fait rayonner. Elle est réservée au bouton principal — si tout
 *   rayonnait, plus rien ne rayonnerait.
 *
 * - **Deux pixels de soulèvement au survol**, rendus au clic. Le geste complet
 *   se lit : on approche, ça monte ; on appuie, ça s'enfonce.
 *
 * - **Le survol passe par `--primary-hover`** et non par `bg-primary/90`. Une
 *   opacité fixe éclaircit sur fond clair et **assombrit** sur fond sombre :
 *   le même geste produisait deux effets opposés selon le thème.
 */
const buttonVariants = cva(
  [
    'group/bouton relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md',
    'text-sm font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-ci',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none',
    'motion-safe:active:scale-[0.985] motion-safe:active:translate-y-0',
    '[&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-150',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-primary bg-gradient-to-b from-primary to-primary-hover text-primary-foreground',
          'shadow-halo hover:from-primary-hover hover:to-primary-hover',
          'motion-safe:hover:-translate-y-0.5',
        ].join(' '),
        destructive: [
          'bg-destructive bg-gradient-to-b from-destructive to-destructive text-destructive-foreground',
          'shadow-sm hover:brightness-110 motion-safe:hover:-translate-y-0.5',
        ].join(' '),
        outline: 'border border-border bg-surface text-foreground shadow-sm hover:bg-accent hover:border-border-strong hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[2.125rem] px-3.5 py-1.5 [&_svg]:size-4',
        sm: 'h-[1.875rem] px-2.5 text-xs [&_svg]:size-3.5',
        lg: 'h-10 px-5 text-base [&_svg]:size-4',
        icon: 'h-[2.125rem] w-[2.125rem] [&_svg]:size-4',
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
