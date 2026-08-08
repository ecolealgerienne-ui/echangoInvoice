import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { purchasesApi, suppliersApi, productsApi, settingsApi, resolveApiError } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { enregistrerBlob } from '@/lib/download';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { ExportButton } from '@/components/shared/ExportButton';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, CheckCircle, XCircle, CreditCard, Pencil, Eye, RotateCcw, FileDown } from 'lucide-react';


const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'cash', 'other'] as const;

const billItemSchema = z.object({
  finishedProductId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  taxRate: z.string().optional(),
});

const billSchema = z.object({
  purchaseOrderId: z.string().uuid().optional().or(z.literal('')),
  supplierId: z.string().uuid('purchases.supplierRequired'),
  billDate: z.string().min(1),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(billItemSchema).min(1, 'Au moins un article requis'),
});
type BillFormData = z.infer<typeof billSchema>;

const paymentSchema = z.object({
  amount: z.coerce.number().positive('purchases.invalidAmount'),
  paymentDate: z.string().min(1),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().optional(),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

export function VendorBillsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [viewTarget, setViewTarget] = useState<any | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-bills', page],
    queryFn: () => purchasesApi.listBills({ page, limit: 20 }),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => suppliersApi.list({ limit: 200 }),
  });
  const suppliers: any[] = suppliersData?.data ?? [];

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productsApi.list({ limit: 500 }),
  });
  const products: any[] = productsData?.data ?? [];

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });
  const taxRates: { name: string; rate: number; isDefault?: boolean }[] = (settingsData as any)?.data?.taxRates ?? [];

  const defaultTaxRate = parseFloat(String(taxRates.find(r => r.isDefault)?.rate ?? taxRates[0]?.rate ?? 19));

  const today = new Date().toISOString().slice(0, 10);
  const paymentDays: number = (settingsData as any)?.data?.defaultPaymentTermsDays ?? 30;
  const inN = new Date(Date.now() + paymentDays * 86400000).toISOString().slice(0, 10);

  const billForm = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: { billDate: today, dueDate: inN, items: [{ quantity: 1, unit: 'pcs', unitPrice: 0, taxRate: String(defaultTaxRate) }] },
  });
  const { fields, append, remove } = useFieldArray({ control: billForm.control, name: 'items' });

  const watchSupplierId = billForm.watch('supplierId');

  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders-for-bill', watchSupplierId],
    queryFn: () => purchasesApi.listOrders({ page: 1, limit: 500, supplierId: watchSupplierId, excludeInvoiced: true }),
    enabled: !!watchSupplierId,
  });
  const availableOrders: any[] = ordersData?.data ?? [];

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentDate: new Date().toISOString().slice(0, 10), method: 'bank_transfer' },
  });

  function openCreate() {
    setEditTarget(null);
    billForm.reset({ purchaseOrderId: '', billDate: today, dueDate: inN, items: [{ quantity: 1, unit: 'pcs', unitPrice: 0, taxRate: String(defaultTaxRate) }] });
    setModalOpen(true);
  }

  function openEdit(bill: any) {
    setEditTarget(bill);
    billForm.reset({
      purchaseOrderId: bill.purchaseOrderId ?? '',
      supplierId: bill.supplierId,
      billDate: bill.billDate?.slice(0, 10) ?? '',
      dueDate: bill.dueDate?.slice(0, 10) ?? '',
      notes: bill.notes ?? '',
      items: (bill.items ?? []).map((i: any) => ({
        finishedProductId: i.finishedProductId ?? '',
        description: i.description ?? '',
        quantity: parseFloat(i.quantity),
        unit: i.unit,
        unitPrice: parseFloat(i.unitPrice),
        taxRate: i.taxRate != null ? String(parseFloat(String(i.taxRate))) : String(defaultTaxRate),
      })),
    });
    setModalOpen(true);
  }

  function handlePoSelect(poId: string) {
    billForm.setValue('purchaseOrderId', poId || (undefined as any));
    if (!poId) return;
    purchasesApi.getOrder(poId).then((res: any) => {
      const po = res.data;
      if (po.items?.length) {
        billForm.setValue('items', po.items.map((it: any) => ({
          finishedProductId: it.rawMaterialId ?? '',
          quantity: Number(it.quantity),
          unit: it.unit ?? 'pcs',
          unitPrice: Number(it.unitPrice),
          taxRate: String(parseFloat(String(it.taxRate ?? defaultTaxRate))),
        })));
      }
    });
  }

  const saveMutation = useMutation({
    mutationFn: (data: BillFormData) => {
      const body = {
        ...data,
        purchaseOrderId: data.purchaseOrderId || undefined,
        items: data.items.map(i => ({
          ...i,
          finishedProductId: i.finishedProductId || undefined,
          description: i.description || undefined,
          taxRate: i.taxRate != null ? parseFloat(i.taxRate) : undefined,
        })),
      };
      return editTarget
        ? purchasesApi.updateBill(editTarget.id, body)
        : purchasesApi.createBill(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      toast(editTarget ? t('purchases.billUpdated') : t('purchases.billCreated'), 'success');
      setModalOpen(false);
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const validateMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.updateBillStatus(id, 'validated'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      toast(t('purchases.billValidated'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.updateBillStatus(id, 'cancelled'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('purchases.billCancelled'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.updateBillStatus(id, 'draft'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('purchases.billReopened'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.removeBill(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      toast(t('purchases.billDeleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const paymentMutation = useMutation({
    mutationFn: (data: PaymentFormData) => purchasesApi.addBillPayment(paymentTarget.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-bills'] });
      toast(t('purchases.paymentAdded'), 'success');
      setPaymentTarget(null);
      paymentForm.reset({ paymentDate: new Date().toISOString().slice(0, 10), method: 'bank_transfer' });
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openPayment(bill: any) {
    setPaymentTarget(bill);
    const remaining = parseFloat(bill.amountDue);
    paymentForm.reset({
      amount: remaining,
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'bank_transfer',
    });
  }

  const watchItems = billForm.watch('items');
  const subtotalHT = watchItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const totalTVA = watchItems.reduce((s, i) => {
    const ht = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
    return s + ht * (Number(i.taxRate) || 0) / 100;
  }, 0);
  const subtotal = subtotalHT + totalTVA;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('purchases.billsTitle')}</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />{t('purchases.newBill')}
        </Button>
      </div>

      <div className="flex justify-end items-center gap-2">
        <ExportButton dataset="factures-fournisseurs" libelle={t('purchases.exportBills')} />
        <ExportButton dataset="reglements-fournisseurs" libelle={t('purchases.exportPayments')} />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('purchases.billNumber')}</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('suppliers.name')}</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('purchases.billDate')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.amount')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('purchases.amountPaid')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('purchases.amountDue')}</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.data?.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
                )}
                {data?.data?.map((bill: any) => (
                  <tr key={bill.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm">
                      <Link to={`/purchases/vendor-bills/${bill.id}`} className="text-primary hover:underline">
                        {bill.billNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{bill.supplierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(bill.billDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(bill.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-success whitespace-nowrap tabular-nums">{formatCurrency(bill.amountPaid)}</td>
                    <td className="px-4 py-3 text-right text-destructive whitespace-nowrap tabular-nums">{formatCurrency(bill.amountDue)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={varianteStatut(bill.status)}>
                        {t(`purchases.billStatus.${bill.status}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={async () => {
                          const res = await purchasesApi.getBill(bill.id);
                          setViewTarget(res.data);
                        }} title={t('common.actions')}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title={t('purchases.pdfBill')}
                          onClick={() => {
                            purchasesApi.pdfBill(bill.id)
                              .then((blob: Blob) => enregistrerBlob(blob, `${bill.billNumber}.pdf`))
                              .catch(() => toast(t('errors.generic'), 'error'));
                          }}>
                          <FileDown className="h-4 w-4" />
                        </Button>
                        {bill.status === 'draft' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(bill)} title={t('common.edit')}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => validateMutation.mutate(bill.id)} title={t('purchases.validate')}>
                              <CheckCircle className="h-4 w-4 text-success" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(bill.id)} title={t('common.delete')}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        {['validated', 'partial'].includes(bill.status) && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openPayment(bill)} title={t('purchases.addPayment')}>
                              <CreditCard className="h-4 w-4 text-info" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(bill.id)} title={t('common.cancel')}>
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </>
                        )}
                        {bill.status === 'cancelled' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => reopenMutation.mutate(bill.id)} title={t('purchases.reopenDraft')}>
                              <RotateCcw className="h-4 w-4 text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(bill.id)} title={t('common.delete')}>
                              <Trash2 className="h-4 w-4 text-destructive" />
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
          {data?.pagination && (
            <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />
          )}
        </>
      )}

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editTarget ? t('common.edit') : t('purchases.newBill')} size="xl">
        <form onSubmit={billForm.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1">{t('suppliers.name')}</label>
              <select className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...billForm.register('supplierId')}
                onChange={e => {
                  billForm.setValue('supplierId', e.target.value);
                  billForm.setValue('purchaseOrderId', '');
                }}>
                <option value="">{t('common.select')}</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {billForm.formState.errors.supplierId && <p className="text-xs text-destructive mt-1">{billForm.formState.errors.supplierId.message ? t(billForm.formState.errors.supplierId.message) : ''}</p>}
            </div>
            {watchSupplierId && (
              <div className="col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.linkedPO')}</label>
                <select className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...billForm.register('purchaseOrderId')}
                  onChange={e => handlePoSelect(e.target.value)}>
                  <option value="">{t('purchases.noPO')}</option>
                  {availableOrders.map((o: any) => (
                    <option key={o.id} value={o.id}>{o.poNumber}</option>
                  ))}
                </select>
                {availableOrders.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{t('purchases.noPOAvailable')}</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.billDate')}</label>
              <input type="date" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...billForm.register('billDate')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.dueDate')}</label>
              <input type="date" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...billForm.register('dueDate')} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{t('common.items')}</span>
              <Button type="button" variant="outline" size="sm"
                onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'pcs', unitPrice: 0, taxRate: String(defaultTaxRate) })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            {/* Column headers */}
            <div className="grid gap-2 text-xs font-medium text-muted-foreground mb-1 px-1"
              style={{ gridTemplateColumns: '2fr 70px 60px 100px 160px 110px 32px' }}>
              <span>{t('common.product')}</span>
              <span>{t('common.qty')}</span>
              <span>{t('common.unit')}</span>
              <span>{t('common.price')}</span>
              <span>{t('purchases.taxRate')}</span>
              <span className="text-right">TTC</span>
              <span></span>
            </div>
            <div className="space-y-2">
              {fields.map((field, idx) => {
                const ht = (Number(watchItems[idx]?.quantity) || 0) * (Number(watchItems[idx]?.unitPrice) || 0);
                const ttc = ht * (1 + (Number(watchItems[idx]?.taxRate) || 0) / 100);
                return (
                  <div key={field.id} className="grid gap-2 items-center"
                    style={{ gridTemplateColumns: '2fr 70px 60px 100px 160px 110px 32px' }}>
                    {/* Product */}
                    <select className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      {...billForm.register(`items.${idx}.finishedProductId`)}
                      onChange={(e) => {
                        const p = products.find((p: any) => p.id === e.target.value);
                        if (p) {
                          billForm.setValue(`items.${idx}.unit`, p.unit ?? 'pcs');
                          billForm.setValue(`items.${idx}.unitPrice`, parseFloat(p.lastCostPerUnit ?? 0));
                        }
                        billForm.setValue(`items.${idx}.finishedProductId`, e.target.value);
                      }}>
                      <option value="">{t('common.select')}…</option>
                      {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {/* Qty */}
                    <input type="number" step="0.01"
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      {...billForm.register(`items.${idx}.quantity`)} />
                    {/* Unit — read-only badge */}
                    <span className="inline-flex items-center justify-center rounded bg-muted px-1.5 py-1 text-xs text-muted-foreground font-medium truncate">
                      {watchItems[idx]?.unit || 'pcs'}
                    </span>
                    {/* Unit price */}
                    <input type="number" step="0.01"
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      {...billForm.register(`items.${idx}.unitPrice`)} />
                    {/* TVA dropdown */}
                    <select className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      {...billForm.register(`items.${idx}.taxRate`)}>
                      <option value="0">0%</option>
                      {taxRates.map(r => { const v = String(parseFloat(String(r.rate))); return <option key={v} value={v}>{r.name} ({v}%)</option>; })}
                      {taxRates.length === 0 && <option value="19">TVA 19%</option>}
                    </select>
                    {/* TTC */}
                    <span className="whitespace-nowrap text-xs font-medium text-foreground text-right block">
                      {formatCurrency(ttc)}
                    </span>
                    {/* Delete */}
                    <div className="flex justify-center">
                      {fields.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="p-0 h-auto" onClick={() => remove(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-6 text-sm border-t border-border pt-2 mt-2">
              <span className="text-muted-foreground">{t('purchases.subtotal')} : <span className="font-medium text-foreground">{formatCurrency(subtotalHT)}</span></span>
              <span className="text-muted-foreground">{t('purchases.taxAmount')} : <span className="font-medium text-foreground">{formatCurrency(totalTVA)}</span></span>
              <span className="font-semibold">Total TTC : {formatCurrency(subtotal)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">{t('common.notes')}</label>
            <textarea rows={2} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" {...billForm.register('notes')} />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal open={!!paymentTarget} onClose={() => setPaymentTarget(null)} title={t('purchases.addPayment')}>
        {paymentTarget && (
          <form onSubmit={paymentForm.handleSubmit((d) => paymentMutation.mutate(d))} className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium text-foreground">{paymentTarget.billNumber} — {paymentTarget.supplierName}</p>
              <p className="text-muted-foreground">{t('purchases.amountDue')}: <span className="font-semibold text-destructive">{formatCurrency(paymentTarget.amountDue)}</span></p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.paymentAmount')}</label>
              <input type="number" step="0.01" min="0.01"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...paymentForm.register('amount')} />
              {paymentForm.formState.errors.amount && <p className="text-xs text-destructive mt-1">{paymentForm.formState.errors.amount.message ? t(paymentForm.formState.errors.amount.message) : ''}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.paymentDate')}</label>
                <input type="date" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...paymentForm.register('paymentDate')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.paymentMethod')}</label>
                <select className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...paymentForm.register('method')}>
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{t(`invoices.methods.${m}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('purchases.paymentReference')}</label>
              <input type="text" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" {...paymentForm.register('reference')} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setPaymentTarget(null)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? t('common.loading') : t('invoices.recordPayment')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={viewTarget?.billNumber ?? ''}>
        {viewTarget && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">{t('suppliers.name')}:</span> <span className="font-medium">{viewTarget.supplierName}</span></div>
              <div><span className="text-muted-foreground">{t('common.status')}:</span> <Badge variant={varianteStatut(viewTarget.status)}>{t(`purchases.billStatus.${viewTarget.status}`)}</Badge></div>
              <div><span className="text-muted-foreground">{t('purchases.billDate')}:</span> {formatDate(viewTarget.billDate)}</div>
              {viewTarget.dueDate && <div><span className="text-muted-foreground">{t('purchases.dueDate')}:</span> {formatDate(viewTarget.dueDate)}</div>}
            </div>
            <table className="w-full text-xs border border-border rounded">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1.5 text-left">{t('common.description')}</th>
                  <th className="px-2 py-1.5 text-right">{t('common.qty')}</th>
                  <th className="px-2 py-1.5 text-right">{t('common.price')}</th>
                  <th className="px-2 py-1.5 text-right">TVA</th>
                  <th className="px-2 py-1.5 text-right">{t('common.total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {viewTarget.items?.map((i: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-2 py-1.5">{i.productName ?? i.description ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{parseFloat(i.quantity)} {i.unit}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{formatCurrency(i.unitPrice)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{i.taxRate != null ? `${parseFloat(i.taxRate)}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap tabular-nums">{formatCurrency(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-right">
              <p className="text-muted-foreground">HT: {formatCurrency(viewTarget.subtotal)}</p>
              <p className="text-muted-foreground">TVA: {formatCurrency(viewTarget.taxAmount)}</p>
              <p className="font-bold text-foreground">{t('common.total')}: {formatCurrency(viewTarget.totalAmount)}</p>
              <p className="text-success">{t('purchases.amountPaid')}: {formatCurrency(viewTarget.amountPaid)}</p>
              <p className="text-destructive font-semibold">{t('purchases.amountDue')}: {formatCurrency(viewTarget.amountDue)}</p>
            </div>
            {viewTarget.payments?.length > 0 && (
              <div>
                <p className="font-medium text-foreground mb-1">{t('purchases.addPayment')}</p>
                <div className="space-y-1">
                  {viewTarget.payments.map((p: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatDate(p.paymentDate)} — {t(`invoices.methods.${p.method}`)}{p.reference ? ` (${p.reference})` : ''}</span>
                      <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewTarget(null)}>{t('common.close')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
