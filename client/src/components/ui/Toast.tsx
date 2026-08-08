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
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-4 shadow-lg text-sm',
              t.variant === 'success' && 'bg-success-subtle border-success/30 text-success-text',
              t.variant === 'error' && 'bg-destructive-subtle border-destructive/30 text-destructive-text',
              t.variant === 'warning' && 'bg-warning-subtle border-warning/30 text-warning-text',
            )}
          >
            {t.variant === 'success' && <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />}
            {t.variant === 'error' && <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
            {t.variant === 'warning' && <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="opacity-50 hover:opacity-100">
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
