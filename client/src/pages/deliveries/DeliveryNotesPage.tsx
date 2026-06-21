import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { deliveriesApi, customersApi, productsApi, settingsApi, resolveApiError } from '@/lib/api';
import { useUnits } from '@/lib/useUnits';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Search, Send, XCircle, FileDown, Pencil, CheckCircle, Package, Receipt } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', sent: 'info', signed: 'warning', delivered: 'success', cancelled: 'secondary',
};

const itemSchema = z.object({
  finishedProductId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  taxRate1: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  customerId: z.string().uuid(),
  deliveryDate: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

type FormData = z.infer<typeof schema>;

const today = new Date().toISOString().split('T')[0];

export function DeliveryNotesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { visible, toggle, col } = useColumnVisibility(
    'deliveries_visible_columns',
    ['blNumber', 'customer', 'date', 'amount', 'status'],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-notes', page, search, status],
    queryFn: () => deliveriesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 20, search: undefined }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });
  const productList = productsData?.data ?? [];
  useUnits();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const taxRates: { name: string; rate: number; isDefault: boolean }[] = settingsData?.data?.taxRates ?? [];
  const defaultTaxRate = parseFloat(String(taxRates.find(r => r.isDefault)?.rate ?? 19));

  const { register, handleSubmit, control, reset, watch: watchDN, setValue: setDNValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDate: today,
      items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const saveMutation = useMutation({
    mutationFn: (d: FormData) => editing ? deliveriesApi.update(editing.id, d) : deliveriesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      toast(editing ? t('common.save') + ' !' : t('deliveries.created'), 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.updateStatus(id, { status: 'sent' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); toast(t('deliveries.status.sent'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deliverMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.updateStatus(id, { status: 'delivered' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); toast(t('deliveries.status.delivered'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.updateStatus(id, { status: 'cancelled' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); toast(t('deliveries.cancelled'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); toast(t('common.deleted'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.createInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(t('deliveries.invoiceCreated'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() {
    setEditing(null);
    reset({ deliveryDate: today, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] });
    setModalOpen(true);
  }

  function openEdit(bl: any) {
    deliveriesApi.get(bl.id).then((res: any) => {
      const d = res.data ?? res;
      setEditing(d);
      reset({
        customerId: d.customerId,
        deliveryDate: d.deliveryDate?.slice(0, 10) ?? today,
        notes: d.notes ?? '',
        items: (d.items ?? []).map((it: any) => ({
          finishedProductId: it.finishedProductId,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          taxRate1: String(parseFloat(String(it.taxRate1 ?? defaultTaxRate))),
        })),
      });
      setModalOpen(true);
    }).catch(() => toast(t('errors.generic'), 'error'));
  }

  function closeModal() {
    setEditing(null);
    setModalOpen(false);
    reset({ deliveryDate: today, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] });
  }

  function downloadPdf(id: string, blNumber: string) {
    deliveriesApi.pdf(id).then((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${blNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
    }).catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('deliveries.title')}</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('deliveries.new')}
        </Button>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">{t('common.allStatuses')}</option>
          {['draft', 'sent', 'signed', 'delivered', 'cancelled'].map(s => (
            <option key={s} value={s}>{t(`deliveries.status.${s}`)}</option>
          ))}
        </Select>
        <div className="ml-auto">
          <ColumnToggleMenu
            columns={[
              { key: 'blNumber', label: t('deliveries.blNumber') },
              { key: 'customer', label: t('common.customer') },
              { key: 'date', label: t('common.date') },
              { key: 'amount', label: t('common.amount') },
              { key: 'status', label: t('common.status') },
              { key: 'notes', label: 'Notes' },
            ]}
            visible={visible}
            onToggle={toggle}
          />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {col('blNumber') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('deliveries.blNumber')}</th>}
                {col('customer') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.customer')}</th>}
                {col('date') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.date')}</th>}
                {col('amount') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.amount')}</th>}
                {col('status') && <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>}
                {col('notes') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((bl: any) => (
                <tr key={bl.id} className="hover:bg-muted/30 transition-colors">
                  {col('blNumber') && <td className="px-4 py-3 font-mono font-medium text-foreground">{bl.blNumber}</td>}
                  {col('customer') && <td className="px-4 py-3 text-foreground">{bl.customer?.name ?? '—'}</td>}
                  {col('date') && <td className="px-4 py-3 text-muted-foreground">{formatDate(bl.deliveryDate)}</td>}
                  {col('amount') && <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(bl.total)}</td>}
                  {col('status') && <td className="px-4 py-3 text-center"><Badge variant={STATUS_VARIANT[bl.status] ?? 'muted'}>{t(`deliveries.status.${bl.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-4 py-3 text-muted-foreground text-xs">{bl.notes || '—'}</td>}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('common.pdf')} onClick={() => downloadPdf(bl.id, bl.blNumber)}>
                        <FileDown className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {/* brouillon : modifier, envoyer, annuler, supprimer */}
                      {bl.status === 'draft' && (
                        <>
                          <Button variant="ghost" size="icon" title={t('common.edit')} onClick={() => openEdit(bl)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('deliveries.send')} onClick={() => sendMutation.mutate(bl.id)}>
                            <Send className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('common.cancel')} onClick={() => cancelMutation.mutate(bl.id)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('common.delete')} onClick={() => deleteMutation.mutate(bl.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {/* envoyé : livrer, facturer, annuler */}
                      {bl.status === 'sent' && (
                        <>
                          <Button variant="ghost" size="icon" title={t('deliveries.markDelivered')} onClick={() => deliverMutation.mutate(bl.id)}>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          {!bl.convertedToInvoiceId && (
                            <Button variant="ghost" size="icon" title={t('deliveries.createInvoice')} onClick={() => createInvoiceMutation.mutate(bl.id)}>
                              <Receipt className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title={t('common.cancel')} onClick={() => cancelMutation.mutate(bl.id)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {/* livré : facturer, annuler */}
                      {bl.status === 'delivered' && (
                        <>
                          {!bl.convertedToInvoiceId && (
                            <Button variant="ghost" size="icon" title={t('deliveries.createInvoice')} onClick={() => createInvoiceMutation.mutate(bl.id)}>
                              <Receipt className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title={t('common.cancel')} onClick={() => cancelMutation.mutate(bl.id)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('deliveries.new')} size="xl">
        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('common.customer')} *</label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register('customerId')}>
                <option value="">{t('common.select')}</option>
                {customers?.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.customerId && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('common.date')} *</label>
              <Input type="date" {...register('deliveryDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-[2fr_60px_55px_80px_60px_70px_32px] gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">{t('common.product')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('common.qty')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('products.unit')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('purchases.unitPrice')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('settings.taxRate')}</span>
              <span className="text-xs font-medium text-muted-foreground text-right">TTC</span>
            </div>
            {fields.map((field, i) => {
              const selId = watchDN(`items.${i}.finishedProductId`);
              const selProd = productList.find((p: any) => p.id === selId);
              const lineHT = (Number(watchDN(`items.${i}.quantity`)) || 0) * (Number(watchDN(`items.${i}.unitPrice`)) || 0);
              const lineTaxRate = Number(watchDN(`items.${i}.taxRate1`)) || 0;
              const lineTTC = lineHT * (1 + lineTaxRate / 100);
              return (
                <div key={field.id} className="grid grid-cols-[2fr_60px_55px_80px_60px_70px_32px] gap-2 items-center">
                  <select className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    {...register(`items.${i}.finishedProductId`)}
                    onChange={e => {
                      setDNValue(`items.${i}.finishedProductId`, e.target.value);
                      const prod = productList.find((p: any) => p.id === e.target.value);
                      if (prod?.unit) setDNValue(`items.${i}.unit`, prod.unit);
                      if (prod?.defaultSalesPrice) setDNValue(`items.${i}.unitPrice`, prod.defaultSalesPrice);
                    }}>
                    <option value="">{t('common.select')}</option>
                    {productList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Input type="number" step="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} className="text-xs" />
                  <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground text-center truncate">
                    {selProd?.unit ?? watchDN(`items.${i}.unit`) ?? '—'}
                  </span>
                  <input type="hidden" {...register(`items.${i}.unit`)} />
                  <Input type="number" step="0.01" placeholder="P.U. HT" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                  <select className="w-full rounded-md border border-input bg-background px-1 py-1.5 text-xs" {...register(`items.${i}.taxRate1`)}>
                    {taxRates.length > 0
                      ? taxRates.map(r => { const v = String(parseFloat(String(r.rate))); return <option key={v} value={v}>{v}%</option>; })
                      : <option value="19">19%</option>
                    }
                  </select>
                  <span className="text-xs font-medium text-foreground text-right">{formatCurrency(lineTTC)}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {/* Totals summary */}
            {(() => {
              const watchedItems = watchDN('items') ?? [];
              const subtotalHT = watchedItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
              const totalTVA = watchedItems.reduce((s, it) => {
                const ht = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
                return s + ht * (Number(it.taxRate1) || 0) / 100;
              }, 0);
              return (
                <div className="flex justify-end gap-6 text-sm border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground">{t('purchases.subtotal')} : <span className="font-medium text-foreground">{formatCurrency(subtotalHT)}</span></span>
                  <span className="text-muted-foreground">{t('purchases.taxAmount')} : <span className="font-medium text-foreground">{formatCurrency(totalTVA)}</span></span>
                  <span className="font-semibold">Total TTC : {formatCurrency(subtotalHT + totalTVA)}</span>
                </div>
              );
            })()}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('common.notes')}</label>
            <Input {...register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saveMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
