import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { RechercheGlobale } from './RechercheGlobale';
import { stockApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-6 py-3 border-b border-border bg-background shrink-0">
          <RechercheGlobale />
          <button
            onClick={() => navigate('/stock?tab=alerts')}
            className="relative p-2 rounded-md hover:bg-muted transition-colors"
            title={hasAlerts ? `${lowStockCount} produit(s) en stock bas` : 'Alertes stock'}
          >
            <Bell className={`h-5 w-5 ${hasAlerts ? 'text-warning' : 'text-muted-foreground'}`} />
            {hasAlerts && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {lowStockCount > 9 ? '9+' : lowStockCount}
              </span>
            )}
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto max-w-7xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
