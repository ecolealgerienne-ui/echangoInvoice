import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import type { Theme } from '@/lib/theme';

/**
 * Bascule de thème, en trois positions plutôt qu'un interrupteur.
 *
 * Un interrupteur à deux états oblige à choisir entre clair et sombre et fait
 * disparaître « suivre le système » — qui est pourtant le réglage que la
 * plupart des gens veulent, puisqu'il bascule seul le soir. Les trois positions
 * sont visibles d'un coup d'œil : on voit ce qui est actif sans ouvrir de menu.
 *
 * Le groupe est un `radiogroup` et non trois boutons : les flèches du clavier y
 * circulent, et un lecteur d'écran annonce « 1 sur 3 » au lieu de trois boutons
 * sans rapport entre eux.
 */
const OPTIONS: { valeur: Theme; icone: typeof Sun; cle: string }[] = [
  { valeur: 'light', icone: Sun, cle: 'theme.light' },
  { valeur: 'dark', icone: Moon, cle: 'theme.dark' },
  { valeur: 'system', icone: Monitor, cle: 'theme.system' },
];

export function SelecteurTheme() {
  const { t } = useTranslation();
  const { theme, definirTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="inline-flex items-center gap-0.5 rounded-md border border-border bg-champ p-0.5"
    >
      {OPTIONS.map(({ valeur, icone: Icone, cle }) => {
        const actif = theme === valeur;
        return (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={t(cle)}
            title={t(cle)}
            onClick={() => definirTheme(valeur)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              actif
                ? 'bg-surface text-foreground'
                : 'text-tertiaire hover:bg-surface-hover hover:text-foreground',
            )}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
