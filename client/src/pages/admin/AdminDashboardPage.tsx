import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['admin-stats'], queryFn: adminApi.getStats });
  const stats = data?.data;

  if (isLoading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('admin.dashboard.title')}</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.mrrActual')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.mrr?.actual?.toLocaleString('fr-DZ')} DA</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.mrrContractual')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.mrr?.contractual?.toLocaleString('fr-DZ')} DA</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.arr')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.arr?.actual?.toLocaleString('fr-DZ')} DA</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.activeTenants')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.tenants?.active}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.trialTenants')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.tenants?.trial}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.suspendedTenants')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.tenants?.suspended}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.newThisMonth')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.newThisMonth}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('admin.stats.churnThisMonth')}</p>
          <p className="text-2xl font-bold text-foreground">{stats?.churnThisMonth}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold mb-4 text-foreground">{t('admin.stats.topTenants')}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('admin.tenants.title')}</th>
              <th className="text-left py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('admin.plans.title')}</th>
              <th className="text-right py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('admin.stats.invoicesThisMonth')}</th>
            </tr>
          </thead>
          <tbody>
            {stats?.topTenantsByUsage?.map((tenant: any) => (
              <tr key={tenant.tenantId} className="border-b border-border/50">
                <td className="py-2 text-foreground">{tenant.name}</td>
                <td className="py-2 text-foreground">{tenant.plan}</td>
                <td className="py-2 text-right text-foreground whitespace-nowrap tabular-nums">{tenant.invoicesThisMonth}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
