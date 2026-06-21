import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { quotesApi, customersApi, productsApi, settingsApi, deliveriesApi, resolveApiError } from '@/lib/api';
import { useUnits } from '@/lib/useUnits';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Search, FileDown, RefreshCw, Pencil, Send, CheckCircle, XCircle, Truck } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', sent: 'info', accepted: 'success',
  rejected: 'destructive', expired: 'secondary', converted: 'warning',
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
  quoteDate: z.string().min(1),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

type FormData = z.infer<typeof schema>;

const today = new Date().toISOString().split('T')[0];
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

export function QuotesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', page, search, status],
    queryFn: () => quotesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 20, search: undefined }),
  });

  const { data: products } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });

  const units = useUnits();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const taxRates: { name: string; rate: number; isDefault: boolean }[] = settingsData?.data?.taxRates ?? [];
  const defaultTaxRate = parseFloat(String(taxRates.find(r => r.isDefault)?.rate ?? 19));

  const { register, handleSubmit, control, reset, watch: watchQ, setValue: setQValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      quoteDate: today,
      expiryDate: in30,
      items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => editing ? quotesApi.update(editing.id, d) : quotesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      toast(editing ? t('common.save') + ' !' : t('quotes.created'), 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => quotesApi.updateStatus(id, { status: 'sent' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast(t('quotes.sent'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => quotesApi.updateStatus(id, { status: 'accepted' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast(t('quotes.accepted'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => quotesApi.updateStatus(id, { status: 'rejected' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast(t('quotes.rejected'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => quotesApi.convert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(t('quotes.converted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const createBlMutation = useMutation({
    mutationFn: (id: string) => quotesApi.createBl(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      toast(t('quotes.convertedToBl'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => quotesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      toast(t('quotes.deleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() { setEditing(null); reset({ quoteDate: today, expiryDate: in30, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) }] }); setModalOpen(true); }
  function openEdit(row: any) {
    quotesApi.get(row.id).then((res: any) => {
      const q = res.data ?? res;
      setEditing(q);
      reset({
        customerId: q.customerId,
        quoteDate: q.quoteDate?.slice(0, 10) ?? today,
        expiryDate: q.expiryDate?.slice(0, 10) ?? '',
        notes: q.notes ?? '',
        items: (q.items ?? []).map((it: any) => ({
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
  function closeModal() { setEditing(null); reset(); setModalOpen(false); }

  function downloadPdf(id: string, number: string) {
    quotesApi.pdf(id).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    }).catch(() => toast(t('errors.generic'), 'error'));
  }

  const quotes = data?.data ?? [];
  const pagination = data?.pagination;
  const { visible, toggle, col } = useColumnVisibility(
    'quotes_visible_columns',
    ['number', 'customer', 'quoteDate', 'expiryDate', 'total', 'status'],
  );
  const customerList = customers?.data ?? [];
  const productList = products?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('quotes.title')}</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />{t('quotes.new')}
        </Button>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('common.search')} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="draft">{t('status.draft')}</option>
          <option value="sent">{t('status.sent')}</option>
          <option value="accepted">{t('status.accepted')}</option>
          <option value="rejected">{t('status.rejected')}</option>
          <option value="expired">{t('status.expired')}</option>
          <option value="converted">{t('status.converted')}</option>
        </Select>
        <div className="ml-auto">
          <ColumnToggleMenu
            columns={[
              { key: 'number', label: t('quotes.quoteNumber') },
              { key: 'customer', label: t('customers.title') },
              { key: 'quoteDate', label: t('quotes.quoteDate') },
              { key: 'expiryDate', label: t('quotes.expiryDate') },
              { key: 'total', label: 'Total TTC' },
              { key: 'status', label: t('quotes.status') },
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
            <thead className="bg-muted">
              <tr>
                {col('number') && <th className="text-left px-4 py-3 font-medium">{t('quotes.quoteNumber')}</th>}
                {col('customer') && <th className="text-left px-4 py-3 font-medium">{t('customers.title')}</th>}
                {col('quoteDate') && <th className="text-left px-4 py-3 font-medium">{t('quotes.quoteDate')}</th>}
                {col('expiryDate') && <th className="text-left px-4 py-3 font-medium">{t('quotes.expiryDate')}</th>}
                {col('total') && <th className="text-right px-4 py-3 font-medium">Total TTC</th>}
                {col('status') && <th className="text-left px-4 py-3 font-medium">{t('quotes.status')}</th>}
                {col('notes') && <th className="text-left px-4 py-3 font-medium">Notes</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q: any) => (
                <tr key={q.id} className="border-t border-border hover:bg-muted/30">
                  {col('number') && <td className="px-4 py-3 font-mono text-xs">{q.quoteNumber}</td>}
                  {col('customer') && <td className="px-4 py-3">{q.customer?.name ?? '—'}</td>}
                  {col('quoteDate') && <td className="px-4 py-3">{formatDate(q.quoteDate)}</td>}
                  {col('expiryDate') && <td className="px-4 py-3">{q.expiryDate ? formatDate(q.expiryDate) : '—'}</td>}
                  {col('total') && <td className="px-4 py-3 text-right font-medium">{formatCurrency(q.totalAmount)}</td>}
                  {col('status') && <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[q.status] ?? 'muted'}>{t(`status.${q.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-4 py-3 text-muted-foreground text-xs">{q.notes || '—'}</td>}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" title={t('common.pdf')} onClick={() => downloadPdf(q.id, q.quoteNumber)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                      {q.status === 'draft' && (
                        <>
                          <Button size="sm" variant="ghost" title={t('common.edit')} onClick={() => openEdit(q)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title={t('quotes.send')} onClick={() => sendMutation.mutate(q.id)}>
                            <Send className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button size="sm" variant="ghost" title={t('common.delete')} onClick={() => removeMutation.mutate(q.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {q.status === 'sent' && (
                        <>
                          <Button size="sm" variant="ghost" title={t('common.edit')} onClick={() => openEdit(q)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title={t('quotes.accept')} onClick={() => acceptMutation.mutate(q.id)}>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="sm" variant="ghost" title={t('quotes.reject')} onClick={() => rejectMutation.mutate(q.id)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {q.status === 'accepted' && (
                        <>
                          <Button size="sm" variant="ghost" title={t('quotes.createBl')} onClick={() => createBlMutation.mutate(q.id)}>
                            <Truck className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button size="sm" variant="ghost" title={t('quotes.convert')} onClick={() => convertMutation.mutate(q.id)}>
                            <RefreshCw className="h-4 w-4 text-green-600" />
                          </Button>
                        </>
                      )}
                      {q.status === 'rejected' && (
                        <Button size="sm" variant="ghost" title={t('common.delete')} onClick={() => removeMutation.mutate(q.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (
        <Pagination page={page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('quotes.new')}>
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('customers.title')}</label>
              <Select {...register('customerId')} className="mt-1 w-full">
                <option value="">{t('common.select')}</option>
                {customerList.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              {errors.customerId && <p className="text-xs text-destructive mt-1">{t('errors.required')}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">{t('quotes.quoteDate')}</label>
              <Input type="date" {...register('quoteDate')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('quotes.expiryDate')}</label>
              <Input type="date" {...register('expiryDate')} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 mb-1">
              <div className="col-span-3 text-xs font-medium text-muted-foreground">{t('common.product')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('common.qty')}</div>
              <div className="col-span-1 text-xs font-medium text-muted-foreground">{t('products.unit')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('purchases.unitPrice')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('settings.taxRate')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground text-right">TTC</div>
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => {
                const selId = watchQ(`items.${i}.finishedProductId`);
                const selProd = (productList as any[]).find((p: any) => p.id === selId);
                const lineHT = (Number(watchQ(`items.${i}.quantity`)) || 0) * (Number(watchQ(`items.${i}.unitPrice`)) || 0);
                const lineTaxRate = Number(watchQ(`items.${i}.taxRate1`)) || 0;
                const lineTTC = lineHT * (1 + lineTaxRate / 100);
                return (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Select {...register(`items.${i}.finishedProductId`)} className="w-full text-xs"
                      onChange={e => {
                        setQValue(`items.${i}.finishedProductId`, e.target.value);
                        const prod = (productList as any[]).find((p: any) => p.id === e.target.value);
                        if (prod?.unit) setQValue(`items.${i}.unit`, prod.unit);
                        if (prod?.defaultSalesPrice) setQValue(`items.${i}.unitPrice`, prod.defaultSalesPrice);
                      }}>
                      <option value="">{t('products.title')}</option>
                      {(productList as any[]).map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} className="text-xs" />
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground block text-center truncate">
                      {selProd?.unit ?? watchQ(`items.${i}.unit`) ?? '—'}
                    </span>
                    <input type="hidden" {...register(`items.${i}.unit`)} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0" placeholder="P.U. HT" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Select {...register(`items.${i}.taxRate1`)} className="w-full text-xs">
                      {taxRates.length > 0
                        ? taxRates.map(r => { const v = String(parseFloat(String(r.rate))); return <option key={v} value={v}>{v}%</option>; })
                        : <option value="19">19%</option>
                      }
                    </Select>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-xs font-medium text-foreground">{formatCurrency(lineTTC)}</span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {fields.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
            {/* Totals summary */}
            {(() => {
              const watchedItems = watchQ('items') ?? [];
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

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
