import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const current = ++id;
    setToasts(prev => [...prev, { id: current, message, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== current)), 4000);
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map(t => (
          // Le message surgit au lieu d'apparaître : posé sans mouvement dans
          // un coin de l'écran, il passe inaperçu — et une confirmation qu'on
          // ne voit pas est une confirmation qui n'existe pas. La tranche
          // colorée du côté de la lecture double la couleur du fond : sur fond
          // ténu, c'est elle qu'on attrape du coin de l'œil.
          <div
            key={t.id}
            role="status"
            className={cn(
              'surgir flex items-start gap-3 rounded-lg border border-s-4 p-4 text-sm shadow-lg',
              t.variant === 'success' && 'border-success-border border-s-success bg-success-subtle text-success-text',
              t.variant === 'error' && 'border-destructive-border border-s-destructive bg-destructive-subtle text-destructive-text',
              t.variant === 'warning' && 'border-warning-border border-s-warning bg-warning-subtle text-warning-text',
            )}
          >
            {t.variant === 'success' && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
            {t.variant === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            {t.variant === 'warning' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="opacity-50 transition-opacity hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
