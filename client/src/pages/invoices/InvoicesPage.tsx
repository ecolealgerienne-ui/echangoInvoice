import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoicesApi, customersApi, productsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Search, Send, XCircle, CreditCard, FileDown } from 'lucide-react';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', sent: 'info', partial: 'warning', paid: 'success', overdue: 'destructive', cancelled: 'secondary',
};

const itemSchema = z.object({
  finishedProductId: z.string().uuid(),
  description: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
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
  const [paymentInvoice, setPaymentInvoice] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, status],
    queryFn: () => invoicesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
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

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { invoiceDate: today, dueDate: in30, items: [{ finishedProductId: '', quantity: 1, unitPrice: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentDate: today, paymentMethod: 'bank_transfer' },
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => invoicesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(t('invoices.created'), 'success');
      closeModal();
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.sent'), 'success'); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.cancelled'), 'success'); },
    onError: () => toast(t('errors.generic'), 'error'),
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
    onError: () => toast(t('errors.generic'), 'error'),
  });

  function closeModal() {
    setModalOpen(false);
    reset({ invoiceDate: today, dueDate: in30, items: [{ finishedProductId: '', quantity: 1, unitPrice: 0 }] });
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
        <Button onClick={() => setModalOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> {t('invoices.new')}
        </Button>
      </div>

      <div className="flex gap-3">
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
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.number')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.customer')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.invoiceDate')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.dueDate')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.amount')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.due')}</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-foreground">{inv.customer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatCurrency(inv.amountDue)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[inv.status]}>{t(`invoices.status.${inv.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="PDF" onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}>
                        <FileDown className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.amountDue) > 0 && (
                        <Button variant="ghost" size="icon" title={t('invoices.addPayment')}
                          onClick={() => { setPaymentInvoice(inv); paymentForm.setValue('amount', Number(inv.amountDue)); }}>
                          <CreditCard className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {inv.status === 'draft' && (
                        <Button variant="ghost" size="icon" title={t('invoices.send')} onClick={() => sendMutation.mutate(inv.id)}>
                          <Send className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {['draft', 'sent'].includes(inv.status) && (
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

      {/* Create invoice modal */}
      <Modal open={modalOpen} onClose={closeModal} title={t('invoices.new')}>
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
              <Button type="button" size="sm" variant="outline" onClick={() => append({ finishedProductId: '', quantity: 1, unitPrice: 0 })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[2fr_70px_90px_32px] gap-2 items-center">
                <select className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" {...register(`items.${i}.finishedProductId`)}>
                  <option value="">{t('common.select')}</option>
                  {productList.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Input type="number" step="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} />
                <Input type="number" step="0.01" placeholder={t('common.price')} {...register(`items.${i}.unitPrice`)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
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

      {/* Payment modal */}
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
