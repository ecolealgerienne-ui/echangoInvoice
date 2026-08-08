import { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Pastille de statut.
 *
 * Les variantes sémantiques écrivaient leurs couleurs en dur, façon
 * « vert 100 sur vert 800 ». Une couleur de palette ne connaît qu'un seul
 * thème : en sombre, ces pastilles seraient restées des taches claires posées
 * sur du gris foncé, illisibles et hors sujet. Elles passent par les jetons
 * `*-subtle` / `*-text`, définis dans les deux thèmes.
 *
 * Le fond est ténu et le texte porte la couleur, plutôt que l'inverse : une
 * douzaine de pastilles pleines dans un tableau de trente lignes attire l'œil
 * partout, donc nulle part. La couleur doit signaler l'exception.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium leading-none transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary text-primary-foreground',
        secondary:   'border-border bg-muted text-muted-foreground',
        outline:     'border-border text-foreground',
        muted:       'border-transparent bg-muted text-muted-foreground',
        success:     'border-transparent bg-success-subtle text-success-text',
        warning:     'border-transparent bg-warning-subtle text-warning-text',
        destructive: 'border-transparent bg-destructive-subtle text-destructive-text',
        info:        'border-transparent bg-info-subtle text-info-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /**
   * Point coloré devant le libellé. Il double le signal porté par la couleur,
   * pour les huit pour cent d'hommes qui distinguent mal le rouge du vert —
   * un tableau où seule la teinte distingue « payée » de « en retard » leur
   * est illisible.
   */
  point?: boolean;
}

const POINTS: Record<string, string> = {
  success: 'bg-success', warning: 'bg-warning',
  destructive: 'bg-destructive', info: 'bg-info',
  muted: 'bg-muted-foreground', secondary: 'bg-muted-foreground',
  default: 'bg-primary-foreground', outline: 'bg-foreground',
};

function Badge({ className, variant, point, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {point && (
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', POINTS[variant ?? 'default'])}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
