import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        // Le champ prend `bg-surface` et non `bg-surface` : en sombre, un champ
        // de la couleur exacte de la page derriere lui n'a plus de forme — il ne
        // reste qu'une bordure fine, et l'oeil ne trouve plus ou cliquer.
        [
          'flex h-[2.125rem] w-full rounded-md border border-input bg-surface px-2.5 py-1 text-sm',
          'shadow-sm transition-[border-color,box-shadow] duration-150',
          'placeholder:text-muted-foreground',
          'hover:border-border-strong',
          'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
          // Les champs numeriques alignent leurs chiffres comme les colonnes.
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
