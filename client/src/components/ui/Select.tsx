import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        // Mêmes mesures que `Input`, au pixel près : trente-six de haut, douze
        // de rembourrage, le fond en creux. Un sélecteur et un champ posés côte
        // à côte dans un formulaire doivent avoir exactement la même boîte,
        // sinon la ligne se décale sans qu'on sache dire pourquoi.
        'flex h-9 w-full rounded-md border border-input bg-champ px-3 text-sm text-foreground',
        'transition-[border-color,box-shadow] duration-150 hover:border-border-strong',
        'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/[0.12]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export { Select };
