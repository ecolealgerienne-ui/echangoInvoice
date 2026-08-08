import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { SelecteurPeriode, periodeParDefaut } from '@/components/shared/SelecteurPeriode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { TrendingUp, FileText, Package, DollarSign, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { BarresClassement, CourbeAire } from '@/components/ui/Graphique';

/**
 * Écart par rapport à la période précédente.
 *
 * `null` quand la référence est nulle : le serveur ne rend alors aucun
 * pourcentage, parce qu'aucun n'aurait de sens — et un « 0 % » se lirait comme
 * une stagnation alors qu'on part de rien.
 */
function Evolution({ valeur, inverse }: { valeur: number | null; inverse?: boolean }) {
  const { t } = useTranslation();
  if (valeur === null || valeur === undefined) {
    return <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.pasDeComparaison')}</p>;
  }
  // Sur les dépenses et les achats, une hausse n'est pas une bonne nouvelle.
  const favorable = inverse ? valeur <= 0 : valeur >= 0;
  const signe = valeur > 0 ? '+' : '';
  return (
    <p className={`text-xs mt-0.5 font-medium ${favorable ? 'text-success' : 'text-destructive'}`}>
      {signe}{valeur} % {t('dashboard.vsPeriodePrecedente')}
    </p>
  );
}

function StatCard({ title, value, sub, icon: Icon, variant, evolution, evolutionInverse }: {
  title: string; value: string; sub?: string; icon: React.ElementType; variant?: string;
  evolution?: number | null; evolutionInverse?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            {evolution !== undefined && <Evolution valeur={evolution} inverse={evolutionInverse} />}
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Barre horizontale proportionnelle. Le projet n'embarque aucune librairie de
 * graphiques ; en ajouter une pour quatre barres coûterait plus cher que ces
 * quelques div.
 */
function BarRow({ label, value, max, display }: {
  label: string; value: number; max: number; display: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[60%]">{label}</span>
        <span className="font-medium text-foreground">{display}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const [periode, setPeriode] = useState(periodeParDefaut());

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', periode],
    queryFn: () => dashboardApi.stats(periode),
  });

  const { data: salesChartData } = useQuery({
    queryKey: ['dashboard-sales-chart', periode],
    queryFn: () => dashboardApi.salesChart(periode),
  });

  // Pas de période en paramètre : le stock est une photo à l'instant t.
  const { data: stockChartData } = useQuery({
    queryKey: ['dashboard-stock-chart'],
    queryFn: () => dashboardApi.stockChart(),
  });

  if (isLoading) return <LoadingSpinner />;

  const stats = data?.data;
  if (!stats) return null;

  const { sales, purchases, expenses, profit, stock, alerts } = stats;

  const salesChart = salesChartData?.data;
  const stockChart = stockChartData?.data;
  const byDate: any[] = salesChart?.byDate ?? [];
  const maxDayRevenue = byDate.reduce((m, d) => Math.max(m, d.revenue), 0);
  const byMethod: [string, number][] = Object.entries(salesChart?.byPaymentMethod ?? {});
  const maxMethod = byMethod.reduce((m, [, v]) => Math.max(m, v as number), 0);
  const topStock: any[] = (stockChart?.byRawMaterial ?? []).slice(0, 8);
  const maxStockValue = topStock.reduce((m, r) => Math.max(m, r.stockValue), 0);
  const expiring: any[] = stockChart?.expiringWithin30Days ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">{t('dashboard.title')}</h1>
        <SelecteurPeriode valeur={periode} onChange={setPeriode} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.revenue')}
          value={formatCurrency(sales.totalRevenue)}
          evolution={stats.evolution?.revenue}
          sub={`${sales.invoiceCount} ${t('dashboard.invoiceCount').toLowerCase()}`}
          icon={DollarSign}
        />
        <StatCard
          title={t('dashboard.grossMargin')}
          value={formatCurrency(profit.grossMargin)}
          sub={`${profit.grossMarginPercent}%`}
          icon={TrendingUp}
        />
        <StatCard
          title={t('dashboard.netProfit')}
          value={formatCurrency(profit.netProfit)}
          evolution={stats.evolution?.netProfit}
          sub={`${profit.netProfitPercent}%`}
          icon={TrendingUp}
        />
        <StatCard
          title={t('dashboard.stockValue')}
          value={formatCurrency(stock.totalStockValue)}
          icon={Package}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Expenses breakdown */}
        <Card>
          <CardHeader><CardTitle>{t('dashboard.expenses')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(expenses.byCategory).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{t(`expenses.categories.${cat}`)}</span>
                <span className="font-medium text-foreground">{formatCurrency(amt as number)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
              <span>{t('common.total')}</span>
              <span>{formatCurrency(expenses.totalExpenses)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Top customers */}
        <Card>
          <CardHeader><CardTitle>{t('dashboard.topCustomers')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sales.topCustomers.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
            {sales.topCustomers.map((c: any) => (
              <div key={c.customerId} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[150px]">{c.name}</span>
                <span className="font-medium text-foreground">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader><CardTitle>{t('dashboard.alerts')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <span className="text-muted-foreground">{t('dashboard.expiringSoon')}</span>
              </div>
              <Badge variant={alerts.expiringStockCount > 0 ? 'warning' : 'muted'}>
                {alerts.expiringStockCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-destructive" />
                <span className="text-muted-foreground">{t('dashboard.unpaidInvoices')}</span>
              </div>
              <Badge variant={alerts.unpaidInvoicesCount > 0 ? 'destructive' : 'muted'}>
                {alerts.unpaidInvoicesCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-muted-foreground">{t('dashboard.lowStock')}</span>
              </div>
              <Badge variant={alerts.lowStockCount > 0 ? 'warning' : 'muted'}>
                {alerts.lowStockCount}
              </Badge>
            </div>
            {alerts.unpaidInvoicesTotal > 0 && (
              <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                Impayé total : <span className="font-medium text-foreground">{formatCurrency(alerts.unpaidInvoicesTotal)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Graphiques : ventes du mois, règlements, stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t('dashboard.revenueByDay')}</CardTitle></CardHeader>
          <CardContent>
            {byDate.length === 0
              ? <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
              : (
                <CourbeAire
                  points={byDate.map((d: any) => ({
                    libelle: formatDate(d.date),
                    valeur: Number(d.revenue),
                  }))}
                  format={(v) => formatCurrency(v)}
                />
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('dashboard.byPaymentMethod')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {maxMethod === 0
              ? <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
              : (
                <BarresClassement
                  lignes={byMethod.map(([method, amount]: any) => ({
                    libelle: t(`invoices.methods.${method}`),
                    valeur: Number(amount),
                  }))}
                  format={(v) => formatCurrency(v)}
                />
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('dashboard.stockByProduct')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topStock.length === 0
              ? <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
              : (
                <BarresClassement
                  lignes={topStock.map((r: any) => ({
                    libelle: r.name,
                    valeur: Number(r.stockValue),
                  }))}
                  format={(v) => formatCurrency(v)}
                />
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('dashboard.expiringLots')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {expiring.length === 0
              ? <p className="text-sm text-muted-foreground">{t('dashboard.noExpiringLots')}</p>
              : expiring.slice(0, 8).map((e: any) => (
                <div key={e.stockEntryId} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[50%]">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{e.quantity} {e.unit}</span>
                  <Badge variant={e.daysUntilExpiry <= 7 ? 'destructive' : 'warning'}>
                    {t('dashboard.inDays', { count: e.daysUntilExpiry })}
                  </Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
