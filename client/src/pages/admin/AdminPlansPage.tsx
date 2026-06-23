import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

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

  if (isLoading) return <div className="p-6">{t('common.loading')}</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('admin.plans.title')}</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan: any) => {
          const edit = editing[plan.id] ?? {};
          return (
            <div key={plan.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h2 className="font-semibold text-foreground">{plan.name}</h2>
              <div className="space-y-2 text-sm">
                <label className="block text-muted-foreground">{t('admin.plans.pricePerMonth')}</label>
                <input
                  type="number"
                  defaultValue={plan.pricePerMonth}
                  onChange={e => setEditing(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], pricePerMonth: parseFloat(e.target.value) } }))}
                  className="w-full border border-border rounded px-2 py-1 bg-background text-foreground"
                />
                <label className="block text-muted-foreground">{t('admin.plans.invoiceLimit')}</label>
                <input
                  type="number"
                  defaultValue={plan.invoiceLimit ?? ''}
                  placeholder={t('admin.plans.unlimited')}
                  onChange={e => setEditing(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], invoiceLimit: e.target.value ? parseInt(e.target.value) : null } }))}
                  className="w-full border border-border rounded px-2 py-1 bg-background text-foreground"
                />
                <label className="block text-muted-foreground">{t('admin.plans.usersLimit')}</label>
                <input
                  type="number"
                  defaultValue={plan.usersLimit ?? ''}
                  placeholder={t('admin.plans.unlimited')}
                  onChange={e => setEditing(prev => ({ ...prev, [plan.id]: { ...prev[plan.id], usersLimit: e.target.value ? parseInt(e.target.value) : null } }))}
                  className="w-full border border-border rounded px-2 py-1 bg-background text-foreground"
                />
              </div>
              <button
                onClick={() => updatePlan.mutate({ id: plan.id, dto: edit })}
                className="w-full py-2 text-sm bg-primary text-primary-foreground rounded"
              >
                {t('common.save')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
