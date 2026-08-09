import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Building2, CircleDollarSign, Hourglass, Repeat, TrendingDown, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { montantAbrege } from '@/lib/montants';
import { KpiCard } from '@/components/ui/KpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { TableConteneur } from '@/components/ui/DataTable';

/**
 * Console d'administration — les huit chiffres de l'abonnement.
 *
 * Ils étaient huit `div` écrits à la main, avec leur propre libellé à treize
 * pixels et leur propre rembourrage : la même carte que celle du tableau de
 * bord locataire, mais pas tout à fait — assez près pour qu'on ne le remarque
 * pas, assez loin pour que les deux écrans ne s'accordent jamais. Ils passent
 * par `KpiCard`.
 *
 * Les trois montants d'abonnement suivent la règle des indicateurs : ordre de
 * grandeur affiché, montant exact au survol. Ils étaient rendus par
 * `toLocaleString` suivi d'un « DA » écrit à la main — ce qui donnait un « DA »
 * solitaire tant que la requête n'avait pas répondu.
 *
 * Le désabonnement du mois est le seul à porter un ton d'alerte : c'est le seul
 * des huit dont une hausse est une mauvaise nouvelle.
 */
export function AdminDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['admin-stats'], queryFn: adminApi.getStats });
  const stats = data?.data;

  if (isLoading) return <div className="p-5">{t('common.loading')}</div>;

  return (
    <div className="ci-page space-y-4 p-5">
      <h1>{t('admin.dashboard.title')}</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          titre={t('admin.stats.mrrActual')}
          valeur={montantAbrege(stats?.mrr?.actual)}
          titreValeur={formatCurrency(stats?.mrr?.actual)}
          icon={Wallet}
          ton="primaire"
        />
        <KpiCard
          titre={t('admin.stats.mrrContractual')}
          valeur={montantAbrege(stats?.mrr?.contractual)}
          titreValeur={formatCurrency(stats?.mrr?.contractual)}
          icon={Repeat}
          ton="primaire"
        />
        <KpiCard
          titre={t('admin.stats.arr')}
          valeur={montantAbrege(stats?.arr?.actual)}
          titreValeur={formatCurrency(stats?.arr?.actual)}
          icon={CircleDollarSign}
          ton="succes"
        />
        <KpiCard
          titre={t('admin.stats.activeTenants')}
          valeur={stats?.tenants?.active}
          icon={Building2}
          ton="primaire"
        />
        <KpiCard
          titre={t('admin.stats.trialTenants')}
          valeur={stats?.tenants?.trial}
          icon={Hourglass}
          ton="ambre"
        />
        <KpiCard
          titre={t('admin.stats.suspendedTenants')}
          valeur={stats?.tenants?.suspended}
          icon={TrendingDown}
          ton="ambre"
        />
        <KpiCard
          titre={t('admin.stats.newThisMonth')}
          valeur={stats?.newThisMonth}
          icon={UserPlus}
          ton="succes"
        />
        <KpiCard
          titre={t('admin.stats.churnThisMonth')}
          valeur={stats?.churnThisMonth}
          icon={TrendingUp}
          ton="violet"
          alerte={Number(stats?.churnThisMonth ?? 0) > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.stats.topTenants')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableConteneur dense>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-left">{t('admin.tenants.title')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin.plans.title')}</th>
                  <th className="px-3 py-2.5 text-right">{t('admin.stats.invoicesThisMonth')}</th>
                </tr>
              </thead>
              <tbody>
                {stats?.topTenantsByUsage?.map((tenant: any) => (
                  <tr key={tenant.tenantId}>
                    <td className="px-3 py-2.5 text-xs font-semibold text-foreground">{tenant.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{tenant.plan}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-foreground">
                      {tenant.invoicesThisMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableConteneur>
        </CardContent>
      </Card>
    </div>
  );
}
