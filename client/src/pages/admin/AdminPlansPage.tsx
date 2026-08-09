import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

/**
 * Les trois formules d'abonnement.
 *
 * L'écran écrivait ses propres champs — `border rounded px-2 py-1` — et son
 * propre bouton d'enregistrement, un `<button>` avec un fond de primaire posé à
 * la main. Trois formules ne justifient pas un dialecte : `Card`, `Input`,
 * `Button`, et l'écran suit les mêmes mesures que les trente-six autres.
 */
export function AdminPlansPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, any>>({});

  const { data, isLoading } = useQuery({ queryKey: ['admin-plans'], queryFn: adminApi.listPlans });
  const plans = data?.data ?? [];

  const updatePlan = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) => adminApi.updatePlan(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-plans'] }),
  });

  if (isLoading) return <div className="p-5 text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="ci-page space-y-4 p-5">
      <h1>{t('admin.plans.title')}</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {plans.map((plan: any) => {
          const edit = editing[plan.id] ?? {};
          const modifier = (champ: string, valeur: number | null) =>
            setEditing((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], [champ]: valeur } }));

          return (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-3xs font-medium uppercase text-tertiaire">
                    {t('admin.plans.pricePerMonth')}
                  </label>
                  <Input
                    type="number"
                    defaultValue={plan.pricePerMonth}
                    onChange={(e) => modifier('pricePerMonth', parseFloat(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-3xs font-medium uppercase text-tertiaire">
                    {t('admin.plans.invoiceLimit')}
                  </label>
                  <Input
                    type="number"
                    defaultValue={plan.invoiceLimit ?? ''}
                    placeholder={t('admin.plans.unlimited')}
                    onChange={(e) => modifier('invoiceLimit', e.target.value ? parseInt(e.target.value, 10) : null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-3xs font-medium uppercase text-tertiaire">
                    {t('admin.plans.usersLimit')}
                  </label>
                  <Input
                    type="number"
                    defaultValue={plan.usersLimit ?? ''}
                    placeholder={t('admin.plans.unlimited')}
                    onChange={(e) => modifier('usersLimit', e.target.value ? parseInt(e.target.value, 10) : null)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => updatePlan.mutate({ id: plan.id, dto: edit })}
                >
                  {t('common.save')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
