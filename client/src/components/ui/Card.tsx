import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte.
 *
 * En clair, l'elevation vient de l'ombre ; en sombre, de la clarte de la
 * surface — `--card` y est de 4 % plus clair que `--background`. C'est le
 * meme composant, mais le signal de profondeur change de nature avec le
 * theme, et c'est le jeton qui s'en charge.
 */
const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />
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
