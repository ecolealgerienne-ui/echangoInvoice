import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

export function AdminTenantDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'bank_transfer',
    reference: '',
    paidAt: '',
    monthsCovered: '1',
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: () => adminApi.getTenantDetail(id!),
    enabled: !!id,
  });

  const patchStatus = useMutation({
    mutationFn: (s: string) => adminApi.patchTenantStatus(id!, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenant', id] }),
  });

  const createPayment = useMutation({
    mutationFn: (form: any) => adminApi.createSaasPayment({
      ...form,
      tenantId: id,
      amount: parseFloat(form.amount),
      monthsCovered: parseInt(form.monthsCovered),
    }),
    onSuccess: () => {
      setShowPaymentModal(false);
      qc.invalidateQueries({ queryKey: ['admin-tenant', id] });
    },
  });

  const tenant = data?.data;

  if (isLoading) return <div className="p-6">{t('common.loading')}</div>;
  if (!tenant) return <div className="p-6">{t('common.noData')}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/tenants" className="hover:text-foreground">{t('admin.tenants.title')}</Link>
        <span>/</span>
        <span className="text-foreground">{tenant.name}</span>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h2 className="font-semibold text-foreground">{t('admin.tenants.detail.company')}</h2>
        <p className="text-sm text-foreground">{tenant.name} — {tenant.email}</p>
        <p className="text-sm text-foreground">{tenant.phone}</p>
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
          tenant.status === 'active' ? 'bg-success-subtle text-success-text' :
          tenant.status === 'trial' ? 'bg-warning-subtle text-warning-text' :
          'bg-destructive-subtle text-destructive-text'
        }`}>
          {t(`admin.tenants.status.${tenant.status}`)}
        </span>
        <div className="flex gap-2 mt-2">
          {tenant.status !== 'suspended' ? (
            <button onClick={() => patchStatus.mutate('suspended')} className="px-3 py-1 text-sm bg-destructive-subtle text-destructive-text rounded">
              {t('admin.tenants.actions.suspend')}
            </button>
          ) : (
            <button onClick={() => patchStatus.mutate('active')} className="px-3 py-1 text-sm bg-success-subtle text-success-text rounded">
              {t('admin.tenants.actions.activate')}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h2 className="font-semibold text-foreground">{t('admin.tenants.detail.users')}</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <th className="text-left py-1 text-muted-foreground">{t('admin.tenants.detail.userName')}</th>
            <th className="text-left py-1 text-muted-foreground">{t('admin.tenants.detail.userEmail')}</th>
            <th className="text-left py-1 text-muted-foreground">{t('admin.tenants.detail.userRole')}</th>
          </tr></thead>
          <tbody>
            {tenant.users?.map((u: any) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="py-1 text-foreground">{u.name}</td>
                <td className="py-1 text-foreground">{u.email}</td>
                <td className="py-1 text-foreground">{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-foreground">{t('admin.payment.history')}</h2>
          <button onClick={() => setShowPaymentModal(true)} className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded">
            + {t('admin.payment.record')}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <th className="text-left py-1 text-muted-foreground">{t('common.date')}</th>
            <th className="text-right py-1 text-muted-foreground">{t('common.amount')}</th>
            <th className="text-left py-1 text-muted-foreground">{t('admin.payment.method.label')}</th>
          </tr></thead>
          <tbody>
            {tenant.paymentsHistory?.map((p: any) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="py-1 text-foreground">{new Date(p.paidAt).toLocaleDateString('fr-DZ')}</td>
                <td className="py-1 text-right text-foreground whitespace-nowrap tabular-nums">{parseFloat(p.amount).toLocaleString('fr-DZ')} DA</td>
                <td className="py-1 text-foreground">{t(`admin.payment.method.${p.method}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-foreground/25 backdrop-blur-[2px] flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-foreground">{t('admin.payment.record')}</h2>
            <div className="space-y-3">
              <input
                type="number"
                placeholder={t('admin.payment.amount')}
                value={paymentForm.amount}
                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-surface text-foreground"
              />
              <select
                value={paymentForm.method}
                onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-surface text-foreground"
              >
                <option value="bank_transfer">{t('admin.payment.method.bank_transfer')}</option>
                <option value="cash">{t('admin.payment.method.cash')}</option>
                <option value="check">{t('admin.payment.method.check')}</option>
                <option value="ccp">{t('admin.payment.method.ccp')}</option>
              </select>
              <input
                type="text"
                placeholder={t('admin.payment.reference')}
                value={paymentForm.reference}
                onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-surface text-foreground"
              />
              <input
                type="date"
                value={paymentForm.paidAt}
                onChange={e => setPaymentForm(f => ({ ...f, paidAt: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-surface text-foreground"
              />
              <input
                type="number"
                placeholder={t('admin.payment.monthsCovered')}
                value={paymentForm.monthsCovered}
                onChange={e => setPaymentForm(f => ({ ...f, monthsCovered: e.target.value }))}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-surface text-foreground"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-sm border border-border rounded text-foreground">{t('common.cancel')}</button>
              <button onClick={() => createPayment.mutate(paymentForm)} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
