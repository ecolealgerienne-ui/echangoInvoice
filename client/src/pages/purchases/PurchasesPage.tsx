import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { purchasesApi, suppliersApi, productsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2 } from 'lucide-react';

const PO_STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', sent: 'info', received: 'success', cancelled: 'destructive',
};
const REC_STATUS_VARIANT: Record<string, any> = {
  pending: 'warning', partial: 'info', completed: 'success',
};

// ── Purchase Order form ──────────────────────────────────────────────────────
const poItemSchema = z.object({
  rawMaterialId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
});
const poSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string().min(1),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1),
});
type PoFormData = z.infer<typeof poSchema>;

// ── Reception BL form ────────────────────────────────────────────────────────
const recItemSchema = z.object({
  rawMaterialId: z.string().uuid(),
  quantityReceived: z.coerce.number().positive(),
  costPerUnit: z.coerce.number().min(0),
  batchNumber: z.string().optional(),
  expiresAt: z.string().optional(),
});
const recSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  receptionDate: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(recItemSchema).min(1),
});
type RecFormData = z.infer<typeof recSchema>;

const today = new Date().toISOString().split('T')[0];

export function PurchasesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'orders' | 'receptions'>('orders');
  const [page, setPage] = useState(1);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [recModalOpen, setRecModalOpen] = useState(false);

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['purchase-orders', page],
    queryFn: () => purchasesApi.listOrders({ page, limit: 20 }),
    enabled: tab === 'orders',
  });
  const { data: receptionsData, isLoading: receptionsLoading } = useQuery({
    queryKey: ['reception-bls', page],
    queryFn: () => purchasesApi.listReceptions({ page, limit: 20 }),
    enabled: tab === 'receptions',
  });
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', 1, ''],
    queryFn: () => suppliersApi.list({ page: 1, limit: 200 }),
  });
  const { data: productsForPO } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });
  const { data: ordersForSelect } = useQuery({
    queryKey: ['purchase-orders-select'],
    queryFn: () => purchasesApi.listOrders({ limit: 200, status: 'sent' }),
    enabled: recModalOpen,
  });

  // ── PO form ───────────────────────────────────────────────────────────────
  const poForm = useForm<PoFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: { orderDate: today, items: [{ rawMaterialId: '', quantity: 1, unit: 'kg', unitPrice: 0 }] },
  });
  const { fields: poFields, append: poAppend, remove: poRemove } = useFieldArray({ control: poForm.control, name: 'items' });

  const createPoMutation = useMutation({
    mutationFn: (d: PoFormData) => purchasesApi.createOrder(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('purchases.orderCreated'), 'success');
      setPoModalOpen(false); poForm.reset();
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const removePoMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.removeOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('common.deleted'), 'success');
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  // ── Reception form ────────────────────────────────────────────────────────
  const recForm = useForm<RecFormData>({
    resolver: zodResolver(recSchema),
    defaultValues: { receptionDate: today, items: [{ rawMaterialId: '', quantityReceived: 1, costPerUnit: 0 }] },
  });
  const { fields: recFields, append: recAppend, remove: recRemove } = useFieldArray({ control: recForm.control, name: 'items' });

  const createRecMutation = useMutation({
    mutationFn: (d: RecFormData) => purchasesApi.createReception(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reception-bls'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast(t('purchases.receptionCreated'), 'success');
      setRecModalOpen(false); recForm.reset();
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const orders = ordersData?.data ?? [];
  const receptions = receptionsData?.data ?? [];
  const pagination = tab === 'orders' ? ordersData?.pagination : receptionsData?.pagination;
  const suppliers = suppliersData?.data ?? [];
  const rawMats = productsForPO?.data ?? [];
  const openOrders = ordersForSelect?.data ?? [];

  const isLoading = tab === 'orders' ? ordersLoading : receptionsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('purchases.title')}</h1>
        {tab === 'orders' ? (
          <Button onClick={() => setPoModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />{t('purchases.newOrder')}
          </Button>
        ) : (
          <Button onClick={() => setRecModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />{t('purchases.newReception')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['orders', 'receptions'] as const).map(tabName => (
          <button key={tabName}
            onClick={() => { setTab(tabName); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === tabName ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {tabName === 'orders' ? t('purchases.ordersTitle') : t('purchases.receptionsTitle')}
          </button>
        ))}
      </div>

      {isLoading ? <LoadingSpinner /> : tab === 'orders' ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">{t('purchases.poNumber')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('purchases.supplier')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('purchases.orderDate')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('purchases.expectedDelivery')}</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">{t('quotes.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{o.poNumber}</td>
                  <td className="px-4 py-3">{o.supplier?.name ?? '—'}</td>
                  <td className="px-4 py-3">{formatDate(o.orderDate)}</td>
                  <td className="px-4 py-3">{o.expectedDeliveryDate ? formatDate(o.expectedDeliveryDate) : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={PO_STATUS_VARIANT[o.status] ?? 'muted'}>{t(`status.${o.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {o.status === 'draft' && (
                      <Button size="sm" variant="ghost" onClick={() => removePoMutation.mutate(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">{t('purchases.blNumber')}</th>
                <th className="text-left px-4 py-3 font-medium">Commande</th>
                <th className="text-left px-4 py-3 font-medium">{t('purchases.receptionDate')}</th>
                <th className="text-right px-4 py-3 font-medium">{t('purchases.totalReceived')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('quotes.status')}</th>
              </tr>
            </thead>
            <tbody>
              {receptions.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{r.blNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.purchaseOrder?.poNumber ?? r.purchaseOrderId}</td>
                  <td className="px-4 py-3">{formatDate(r.receptionDate)}</td>
                  <td className="px-4 py-3 text-right">{Number(r.totalQuantityReceived).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={REC_STATUS_VARIANT[r.status] ?? 'muted'}>{t(`status.${r.status}`)}</Badge>
                  </td>
                </tr>
              ))}
              {receptions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (
        <Pagination page={page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      {/* PO Modal */}
      <Modal open={poModalOpen} onClose={() => { setPoModalOpen(false); poForm.reset(); }} title={t('purchases.newOrder')}>
        <form onSubmit={poForm.handleSubmit(d => createPoMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('purchases.supplier')}</label>
              <Select {...poForm.register('supplierId')} className="mt-1 w-full">
                <option value="">{t('common.select')}</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('purchases.orderDate')}</label>
              <Input type="date" {...poForm.register('orderDate')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('purchases.expectedDelivery')}</label>
              <Input type="date" {...poForm.register('expectedDeliveryDate')} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => poAppend({ rawMaterialId: '', quantity: 1, unit: 'kg', unitPrice: 0 })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            <div className="space-y-2">
              {poFields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Select {...poForm.register(`items.${i}.rawMaterialId`)} className="w-full text-xs">
                      <option value="">{t('common.select')}</option>
                      {rawMats.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0.01" placeholder={t('common.qty')} {...poForm.register(`items.${i}.quantity`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input placeholder={t('common.unit')} {...poForm.register(`items.${i}.unit`)} className="text-xs" />
                  </div>
                  <div className="col-span-3">
                    <Input type="number" step="0.01" min="0" placeholder="P.U." {...poForm.register(`items.${i}.unitPrice`)} className="text-xs" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {poFields.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => poRemove(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...poForm.register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => { setPoModalOpen(false); poForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createPoMutation.isPending}>
              {createPoMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reception Modal */}
      <Modal open={recModalOpen} onClose={() => { setRecModalOpen(false); recForm.reset(); }} title={t('purchases.newReception')}>
        <form onSubmit={recForm.handleSubmit(d => createRecMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Commande fournisseur</label>
              <Select {...recForm.register('purchaseOrderId')} className="mt-1 w-full">
                <option value="">{t('common.select')}</option>
                {openOrders.map((o: any) => <option key={o.id} value={o.id}>{o.poNumber} — {o.supplier?.name ?? ''}</option>)}
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('purchases.receptionDate')}</label>
              <Input type="date" {...recForm.register('receptionDate')} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => recAppend({ rawMaterialId: '', quantityReceived: 1, costPerUnit: 0 })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            <div className="space-y-2">
              {recFields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Select {...recForm.register(`items.${i}.rawMaterialId`)} className="w-full text-xs">
                      <option value="">{t('common.select')}</option>
                      {rawMats.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0.01" placeholder="Qté reçue" {...recForm.register(`items.${i}.quantityReceived`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0" placeholder="Coût/unité" {...recForm.register(`items.${i}.costPerUnit`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input placeholder="N° lot" {...recForm.register(`items.${i}.batchNumber`)} className="text-xs" />
                  </div>
                  <div className="col-span-1">
                    <Input type="date" {...recForm.register(`items.${i}.expiresAt`)} className="text-xs" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {recFields.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => recRemove(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...recForm.register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => { setRecModalOpen(false); recForm.reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createRecMutation.isPending}>
              {createRecMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
