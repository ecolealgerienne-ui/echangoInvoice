import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  sm:  'max-w-md',
  md:  'max-w-2xl',
  lg:  'max-w-3xl',
  xl:  'max-w-5xl',
  '2xl': 'max-w-7xl',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  size?: keyof typeof SIZE_CLASSES;
}

export function Modal({ open, onClose, title, children, className, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        {/* Le voile s'accompagne d'un flou leger : sur un tableau dense, un simple
            noir a 50 % laisse lire les lignes dessous et la modale ne se detache pas. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            // `bg-surface-elevated` et non `bg-surface` : en sombre, l'elevation ne
            // se lit plus a l'ombre — une ombre noire sur un fond sombre n'existe pas —
            // mais a la clarte de la surface. La modale est donc plus claire que la page.
            'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface-elevated p-5 shadow-lg overflow-y-auto max-h-[90vh]',
            'motion-safe:data-[state=open]:animate-slide-up',
            SIZE_CLASSES[size],
            className,
          )}
        >
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 -m-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
