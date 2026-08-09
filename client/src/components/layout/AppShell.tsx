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
 * La zone de contenu ne porte pas de fond à elle : elle laisse voir celui du
 * document, teinté (L 0.964 en clair, 0.167 en sombre). C'est ce qui permet aux
 * cartes — presque blanches d'un côté, plus claires que la page de l'autre —
 * de se détacher sans ombre.
 *
 * ── Les lueurs d'ambiance ont été retirées ──────────────────────────────
 *
 * Deux taches radiales, une azur et une chaude, étaient posées en haut de la
 * zone de travail pour donner un haut et un bas à un rectangle de deux mille
 * pixels. Elles partent, et pour une raison précise : le nouveau fond est un
 * bleu nuit à 0.026 de chroma, pas un gris. Il a déjà une teinte, une
 * direction, et une lueur par-dessus lui n'ajoute plus qu'un voile qui fait
 * flotter la première rangée de cartes. Le dosage — 70 % de bleu-noir, 20 % de
 * primaire — ne laisse pas de place à une couleur qui ne dit rien.
 *
 * L'en-tête fait soixante-quatre pixels, comme celui de la barre latérale :
 * c'est ce qui aligne le logo et le premier objet de la barre d'outils.
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
        <header className="relative z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-5">
          <RechercheGlobale />
          <div className="flex items-center gap-3">
            <SelecteurTheme />
            <SelecteurLangue />
            <button
              onClick={() => navigate('/stock?tab=alerts')}
              className="relative rounded-md p-2 transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
              title={hasAlerts ? t('nav.alertesStockNombre', { count: lowStockCount }) : t('nav.alertesStock')}
            >
              <Bell className={hasAlerts ? 'h-4 w-4 text-warning' : 'h-4 w-4 text-muted-foreground'} />
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
          {/* La largeur utile passe de 80 à 100 rem. À 80, la liste des clients
              — neuf colonnes, dont une adresse de courrier — repliait l'e-mail
              sur trois lignes et faisait de chaque ligne un pavé de soixante
              pixels de haut, comme les maquettes ne le montrent pas. Le plafond
              demeure : au-delà de 100 rem, une ligne de tableau devient trop
              longue pour que l'œil retrouve sa colonne en revenant à gauche. */}
          <div className="ci-page container mx-auto max-w-[100rem] px-5 py-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
