import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoicesApi, customersApi, productsApi, settingsApi, resolveApiError } from '@/lib/api';
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
import { Plus, Trash2, Search, Send, XCircle, CreditCard, FileDown, Pencil } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', sent: 'info', partial: 'warning', paid: 'success', overdue: 'destructive', cancelled: 'secondary',
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
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'cheque', 'other']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type PaymentFormData = z.infer<typeof paymentSchema>;

const today = new Date().toISOString().split('T')[0];
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

export function InvoicesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<any>(null);
  const { visible, toggle, col } = useColumnVisibility(
    'invoices_visible_columns',
    ['number', 'customer', 'invoiceDate', 'dueDate', 'amount', 'due', 'status', 'notes'],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, status],
    queryFn: () => invoicesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 200, search: undefined }),
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

  const { register, handleSubmit, control, reset, watch: watchInv, setValue: setInvValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { invoiceDate: today, dueDate: in30, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentDate: today, paymentMethod: 'bank_transfer' },
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => editing ? invoicesApi.update(editing.id, d) : invoicesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(editing ? t('common.save') + ' !' : t('invoices.created'), 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.sent'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.cancelled'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const paymentMutation = useMutation({
    mutationFn: (d: PaymentFormData) =>
      invoicesApi.addPayment({ ...d, salesInvoiceId: paymentInvoice.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(t('invoices.paymentAdded'), 'success');
      setPaymentInvoice(null);
      paymentForm.reset({ paymentDate: today, paymentMethod: 'bank_transfer' });
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() {
    setEditing(null);
    reset({ invoiceDate: today, dueDate: in30, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] });
    setModalOpen(true);
  }

  function openEdit(inv: any) {
    invoicesApi.get(inv.id).then((res: any) => {
      const d = res.data ?? res;
      setEditing(d);
      reset({
        customerId: d.customerId,
        invoiceDate: d.invoiceDate?.slice(0, 10) ?? today,
        dueDate: d.dueDate?.slice(0, 10) ?? in30,
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
    reset({ invoiceDate: today, dueDate: in30, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] });
  }

  function downloadPdf(id: string, number: string) {
    invoicesApi.pdf(id).then((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    }).catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('invoices.title')}</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('invoices.new')}
        </Button>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">{t('common.allStatuses')}</option>
          {['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'].map(s => (
            <option key={s} value={s}>{t(`invoices.status.${s}`)}</option>
          ))}
        </Select>
        <div className="ml-auto">
          <ColumnToggleMenu
            columns={[
              { key: 'number', label: t('invoices.number') },
              { key: 'customer', label: t('invoices.customer') },
              { key: 'invoiceDate', label: t('invoices.invoiceDate') },
              { key: 'dueDate', label: t('invoices.dueDate') },
              { key: 'amount', label: t('invoices.amount') },
              { key: 'due', label: t('invoices.due') },
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
                {col('number') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.number')}</th>}
                {col('customer') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.customer')}</th>}
                {col('invoiceDate') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.invoiceDate')}</th>}
                {col('dueDate') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.dueDate')}</th>}
                {col('amount') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.amount')}</th>}
                {col('due') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.due')}</th>}
                {col('status') && <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>}
                {col('notes') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  {col('number') && <td className="px-4 py-3 font-mono font-medium text-foreground">{inv.invoiceNumber}</td>}
                  {col('customer') && <td className="px-4 py-3 text-foreground">{inv.customer?.name ?? '—'}</td>}
                  {col('invoiceDate') && <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>}
                  {col('dueDate') && <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>}
                  {col('amount') && <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.totalAmount)}</td>}
                  {col('due') && <td className="px-4 py-3 text-right text-foreground">{formatCurrency(inv.amountDue)}</td>}
                  {col('status') && <td className="px-4 py-3 text-center"><Badge variant={STATUS_VARIANT[inv.status]}>{t(`invoices.status.${inv.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-4 py-3 text-muted-foreground text-xs">{inv.notes || '—'}</td>}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('common.pdf')} onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}>
                        <FileDown className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {inv.status === 'draft' && (
                        <>
                          <Button variant="ghost" size="icon" title={t('common.edit')} onClick={() => openEdit(inv)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('invoices.send')} onClick={() => sendMutation.mutate(inv.id)}>
                            <Send className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('common.cancel')} onClick={() => cancelMutation.mutate(inv.id)}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.amountDue) > 0 && (
                        <Button variant="ghost" size="icon" title={t('invoices.addPayment')}
                          onClick={() => { setPaymentInvoice(inv); paymentForm.setValue('amount', Number(inv.amountDue)); }}>
                          <CreditCard className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {inv.status === 'sent' && (
                        <Button variant="ghost" size="icon" title={t('common.cancel')} onClick={() => cancelMutation.mutate(inv.id)}>
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('invoices.new')} size="xl">
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.customer')} *</label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register('customerId')}>
                <option value="">{t('common.select')}</option>
                {customers?.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.customerId && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.invoiceDate')} *</label>
              <Input type="date" {...register('invoiceDate')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.dueDate')} *</label>
              <Input type="date" {...register('dueDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-[2fr_70px_60px_100px_130px_110px_32px] gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">{t('common.product')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('common.qty')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('products.unit')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('purchases.unitPrice')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('settings.taxRate')}</span>
              <span className="text-xs font-medium text-muted-foreground text-right">TTC</span>
            </div>
            {fields.map((field, i) => {
              const selId = watchInv(`items.${i}.finishedProductId`);
              const selProd = productList.find((p: any) => p.id === selId);
              const lineHT = (Number(watchInv(`items.${i}.quantity`)) || 0) * (Number(watchInv(`items.${i}.unitPrice`)) || 0);
              const lineTaxRate = Number(watchInv(`items.${i}.taxRate1`)) || 0;
              const lineTTC = lineHT * (1 + lineTaxRate / 100);
              return (
                <div key={field.id} className="grid grid-cols-[2fr_70px_60px_100px_130px_110px_32px] gap-2 items-center">
                  <select className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    {...register(`items.${i}.finishedProductId`)}
                    onChange={e => {
                      setInvValue(`items.${i}.finishedProductId`, e.target.value);
                      const prod = productList.find((p: any) => p.id === e.target.value);
                      if (prod?.unit) setInvValue(`items.${i}.unit`, prod.unit);
                      if (prod?.defaultSalesPrice) setInvValue(`items.${i}.unitPrice`, prod.defaultSalesPrice);
                    }}>
                    <option value="">{t('common.select')}</option>
                    {productList.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Input type="number" step="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} className="text-xs" />
                  <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground text-center truncate">
                    {selProd?.unit ?? watchInv(`items.${i}.unit`) ?? '—'}
                  </span>
                  <input type="hidden" {...register(`items.${i}.unit`)} />
                  <Input type="number" step="0.01" placeholder="P.U. HT" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                  <select className="w-full rounded-md border border-input bg-background px-1 py-1.5 text-xs" {...register(`items.${i}.taxRate1`)}>
                    {taxRates.length > 0
                      ? taxRates.map(r => { const v = String(parseFloat(String(r.rate))); return <option key={v} value={v}>{v}%</option>; })
                      : <option value="19">19%</option>
                    }
                  </select>
                  <span className="text-xs font-medium text-foreground text-right whitespace-nowrap block">{formatCurrency(lineTTC)}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {/* Totals summary */}
            {(() => {
              const watchedItems = watchInv('items') ?? [];
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
            <Button type="submit" disabled={createMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!paymentInvoice}
        onClose={() => { setPaymentInvoice(null); paymentForm.reset({ paymentDate: today, paymentMethod: 'bank_transfer' }); }}
        title={t('invoices.addPayment')}
      >
        {paymentInvoice && (
          <form onSubmit={paymentForm.handleSubmit(d => paymentMutation.mutate(d))} className="space-y-4">
            <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">{t('invoices.number')} :</span> <span className="font-mono font-medium">{paymentInvoice.invoiceNumber}</span></p>
              <p><span className="text-muted-foreground">{t('invoices.amount')} :</span> <span className="font-medium">{formatCurrency(paymentInvoice.totalAmount)}</span></p>
              <p><span className="text-muted-foreground">{t('invoices.due')} :</span> <span className="font-medium text-destructive">{formatCurrency(paymentInvoice.amountDue)}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentAmount')} *</label>
                <Input type="number" step="0.01" min="0.01" {...paymentForm.register('amount')} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentDate')} *</label>
                <Input type="date" {...paymentForm.register('paymentDate')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentMethod')} *</label>
                <Select {...paymentForm.register('paymentMethod')} className="w-full">
                  <option value="bank_transfer">{t('invoices.methods.bank_transfer')}</option>
                  <option value="cheque">{t('invoices.methods.cheque')}</option>
                  <option value="cash">{t('invoices.methods.cash')}</option>
                  <option value="other">{t('invoices.methods.other')}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentReference')}</label>
                <Input placeholder="N° chèque, virement..." {...paymentForm.register('reference')} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('common.notes')}</label>
              <Input {...paymentForm.register('notes')} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline"
                onClick={() => { setPaymentInvoice(null); paymentForm.reset({ paymentDate: today, paymentMethod: 'bank_transfer' }); }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? <LoadingSpinner size="sm" /> : t('invoices.recordPayment')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
