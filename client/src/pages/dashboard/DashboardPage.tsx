import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, currentMonth } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { TrendingUp, FileText, Package, DollarSign, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

function StatCard({ title, value, sub, icon: Icon, variant }: {
  title: string; value: string; sub?: string; icon: React.ElementType; variant?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
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

export function DashboardPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(currentMonth());

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', month],
    queryFn: () => dashboardApi.stats(month),
  });

  if (isLoading) return <LoadingSpinner />;

  const stats = data?.data;
  if (!stats) return null;

  const { sales, purchases, expenses, profit, stock, alerts } = stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('dashboard.title')}</h1>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.revenue')}
          value={formatCurrency(sales.totalRevenue)}
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
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-muted-foreground">{t('dashboard.expiringSoon')}</span>
              </div>
              <Badge variant={alerts.expiringStockCount > 0 ? 'warning' : 'muted'}>
                {alerts.expiringStockCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-500" />
                <span className="text-muted-foreground">{t('dashboard.unpaidInvoices')}</span>
              </div>
              <Badge variant={alerts.unpaidInvoicesCount > 0 ? 'destructive' : 'muted'}>
                {alerts.unpaidInvoicesCount}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
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
    </div>
  );
}
