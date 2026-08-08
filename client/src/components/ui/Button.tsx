import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Bouton.
 *
 * Trois changements par rapport à la version d'origine, tous motivés :
 *
 * - le survol passe par `--primary-hover` et non par `bg-primary/90`. Une
 *   opacité fixe éclaircit sur fond clair et **assombrit** sur fond sombre :
 *   le même geste produisait deux effets opposés selon le thème ;
 * - `transition-colors` devient `transition-all` avec une légère pression au
 *   clic (`active:scale`). Sur un logiciel où l'on enchaîne les saisies, ce
 *   retour tactile confirme que le clic est parti — sans lui, on reclique ;
 * - l'anneau de focus est décalé de deux pixels. Collé au bord, il se
 *   confondait avec la bordure du bouton et disparaissait à l'œil.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md',
    'text-sm font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'motion-safe:active:scale-[0.985]',
    '[&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:     'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:brightness-110',
        outline:     'border border-border bg-surface text-foreground shadow-sm hover:bg-accent hover:border-border-strong',
        ghost:       'text-foreground hover:bg-accent',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-accent',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[2.125rem] px-3.5 py-1.5 [&_svg]:size-4',
        sm:      'h-[1.875rem] px-2.5 text-xs [&_svg]:size-3.5',
        lg:      'h-10 px-5 text-base [&_svg]:size-4',
        icon:    'h-[2.125rem] w-[2.125rem] [&_svg]:size-4',
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
