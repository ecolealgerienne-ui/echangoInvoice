import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { RechercheGlobale } from './RechercheGlobale';
import { SelecteurLangue } from './SelecteurLangue';
import { SelecteurTheme } from './SelecteurTheme';
import { stockApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Cadre de l'application.
 *
 * La zone de contenu ne porte plus de fond à elle : elle laisse voir celui du
 * document, qui est teinté (L 0.972 en clair, 0.175 en sombre). C'est ce qui
 * permet aux cartes, restées presque blanches, de se détacher — auparavant
 * fond de page et carte valaient tous deux blanc et l'écran n'avait aucune
 * profondeur.
 *
 * Par-dessus, deux lueurs très basses en opacité, ancrées en haut de la zone
 * de travail. Elles ne sont pas décoratives au sens gratuit : elles créent un
 * gradient d'ambiance qui donne un haut et un bas à une page qui, sans elles,
 * est un rectangle uniforme de deux mille pixels. Elles ne défilent pas avec
 * le contenu — une lumière qui bouge avec le texte se voit et gêne.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isSuperAdmin } = useAuth();

  const { data: alertData } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => stockApi.alerts(),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    enabled: !isSuperAdmin,
  });

  const lowStockCount: number = alertData?.data?.summary?.totalLowStock ?? 0;
  const hasAlerts = lowStockCount > 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Ambiance : une lueur azur à gauche, une lueur chaude à droite, très
            loin dans la transparence. Fixées, sans interception d'événement. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-80"
          style={{
            backgroundImage:
              'radial-gradient(60rem 22rem at 12% -20%, oklch(var(--ci-halo) / 0.10), transparent 70%),'
              + 'radial-gradient(48rem 20rem at 92% -30%, oklch(var(--ci-halo-chaud) / 0.08), transparent 70%)',
          }}
        />

        <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface/85 px-6 py-3 backdrop-blur-md">
          <RechercheGlobale />
          <div className="flex items-center gap-3">
            <SelecteurTheme />
            <SelecteurLangue />
            <button
              onClick={() => navigate('/stock?tab=alerts')}
              className="relative rounded-md p-2 transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
              title={hasAlerts ? t('nav.alertesStockNombre', { count: lowStockCount }) : t('nav.alertesStock')}
            >
              <Bell className={hasAlerts ? 'h-5 w-5 text-warning' : 'h-5 w-5 text-muted-foreground'} />
              {hasAlerts && (
                <>
                  {/* Deux couches : l'anneau qui bat, le compteur qui ne bat
                      pas. Un chiffre qui pulse est illisible. */}
                  <span
                    aria-hidden
                    className="pulsation absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full bg-destructive/50"
                  />
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {lowStockCount > 9 ? '9+' : lowStockCount}
                  </span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto">
          <div className="ci-page container mx-auto max-w-7xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
