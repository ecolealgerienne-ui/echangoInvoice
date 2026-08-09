import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { TableConteneur } from '@/components/ui/DataTable';
import { varianteStatut } from '@/lib/statuts';

/**
 * Fiche d'un locataire.
 *
 * Elle avait sa propre modale — un `fixed inset-0` avec un voile, une boîte et
 * deux boutons — alors que `Modal` existe et gère l'échappement, le retour du
 * focus et le portail. Elle avait aussi sa table de statut, ses champs nus et
 * ses tableaux sans cadre.
 *
 * Le pire des trois était la modale maison : elle piégeait le focus nulle part
 * et ne se fermait pas à Échap. C'est le genre de détail qu'on ne voit pas sur
 * une capture d'écran et qui rend l'écran inutilisable au clavier.
 */
export function AdminTenantDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [modaleReglement, setModaleReglement] = useState(false);
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
      monthsCovered: parseInt(form.monthsCovered, 10),
    }),
    onSuccess: () => {
      setModaleReglement(false);
      qc.invalidateQueries({ queryKey: ['admin-tenant', id] });
    },
  });

  const tenant = data?.data;

  if (isLoading) return <div className="p-5 text-sm text-muted-foreground">{t('common.loading')}</div>;
  if (!tenant) return <div className="p-5 text-sm text-muted-foreground">{t('common.noData')}</div>;

  return (
    <div className="ci-page space-y-4 p-5">
      <div className="flex items-center gap-2 text-xs text-tertiaire">
        <Link to="/admin/tenants" className="transition-colors hover:text-foreground">
          {t('admin.tenants.title')}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground">{tenant.name}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.tenants.detail.company')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-foreground">{tenant.name} — {tenant.email}</p>
          <p className="text-sm text-muted-foreground">{tenant.phone}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge point variant={varianteStatut(tenant.status)}>
              {t(`admin.tenants.status.${tenant.status}`)}
            </Badge>
            {tenant.status !== 'suspended' ? (
              <Button variant="outline" size="sm" onClick={() => patchStatus.mutate('suspended')}>
                {t('admin.tenants.actions.suspend')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => patchStatus.mutate('active')}>
                {t('admin.tenants.actions.activate')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.tenants.detail.users')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TableConteneur dense>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-left">{t('admin.tenants.detail.userName')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin.tenants.detail.userEmail')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin.tenants.detail.userRole')}</th>
                </tr>
              </thead>
              <tbody>
                {tenant.users?.map((u: any) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5 text-xs font-semibold text-foreground">{u.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableConteneur>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>{t('admin.payment.history')}</CardTitle>
          <Button size="sm" onClick={() => setModaleReglement(true)}>
            <Plus className="h-4 w-4" />
            {t('admin.payment.record')}
          </Button>
        </CardHeader>
        <CardContent>
          <TableConteneur dense>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-left">{t('common.date')}</th>
                  <th className="px-3 py-2.5 text-right">{t('common.amount')}</th>
                  <th className="px-3 py-2.5 text-left">{t('admin.payment.method.label')}</th>
                </tr>
              </thead>
              <tbody>
                {tenant.paymentsHistory?.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {new Date(p.paidAt).toLocaleDateString('fr-DZ')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-foreground">
                      {parseFloat(p.amount).toLocaleString('fr-DZ')} DA
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {t(`admin.payment.method.${p.method}`)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableConteneur>
        </CardContent>
      </Card>

      <Modal
        open={modaleReglement}
        onClose={() => setModaleReglement(false)}
        title={t('admin.payment.record')}
        size="sm"
      >
        <div className="space-y-3">
          <Input
            type="number"
            placeholder={t('admin.payment.amount')}
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Select
            value={paymentForm.method}
            onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
          >
            <option value="bank_transfer">{t('admin.payment.method.bank_transfer')}</option>
            <option value="cash">{t('admin.payment.method.cash')}</option>
            <option value="check">{t('admin.payment.method.check')}</option>
            <option value="ccp">{t('admin.payment.method.ccp')}</option>
          </Select>
          <Input
            type="text"
            placeholder={t('admin.payment.reference')}
            value={paymentForm.reference}
            onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
          />
          <Input
            type="date"
            value={paymentForm.paidAt}
            onChange={(e) => setPaymentForm((f) => ({ ...f, paidAt: e.target.value }))}
          />
          <Input
            type="number"
            placeholder={t('admin.payment.monthsCovered')}
            value={paymentForm.monthsCovered}
            onChange={(e) => setPaymentForm((f) => ({ ...f, monthsCovered: e.target.value }))}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModaleReglement(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => createPayment.mutate(paymentForm)}>
            {t('common.save')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
