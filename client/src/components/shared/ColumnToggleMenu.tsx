import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ColumnDef {
  key: string;
  label: string;
}

interface Props {
  columns: ColumnDef[];
  visible: string[];
  onToggle: (key: string) => void;
}

export function ColumnToggleMenu({ columns, visible, onToggle }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)}>
        <SlidersHorizontal className="h-4 w-4" />
        {t('common.columns')}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 min-w-44">
          {columns.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-muted text-sm text-left transition-colors"
            >
              <span className={`h-4 w-4 flex items-center justify-center rounded border flex-shrink-0 ${
                visible.includes(key) ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
              }`}>
                {visible.includes(key) && <Check className="h-3 w-3" />}
              </span>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
