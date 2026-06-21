import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { purchasesApi, suppliersApi, productsApi, settingsApi, resolveApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, CheckCircle, Pencil, PackageCheck, Eye } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';

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
  taxRate: z.coerce.number().min(0).default(0),
});
const poSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: z.string().min(1),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1),
});
type PoFormData = z.infer<typeof poSchema>;

// ── Reception BL form ─────────────────────────────────────────────────────────
// Items come from the PO — only quantities/costs/lot are editable
const recItemSchema = z.object({
  rawMaterialId: z.string().uuid(),
  productName: z.string(),           // display only, not sent to backend
  orderedQty: z.number(),            // display only
  unit: z.string(),                  // display only
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

  // PO create/edit modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<any>(null); // null = create, object = edit

  // PO view modal
  const [viewPoId, setViewPoId] = useState<string>('');
  const [viewPoOpen, setViewPoOpen] = useState(false);

  // Reception modal
  const [recModalOpen, setRecModalOpen] = useState(false);
  const [recPoId, setRecPoId] = useState<string>('');

  // Reception BL view modal
  const [viewRecId, setViewRecId] = useState<string>('');
  const [viewRecOpen, setViewRecOpen] = useState(false);

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
  const { data: productsData } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  // Load PO details (items) when reception modal is open with a PO selected
  const { data: recPoDetail } = useQuery({
    queryKey: ['purchase-order-detail', recPoId],
    queryFn: () => purchasesApi.getOrder(recPoId),
    enabled: !!recPoId,
  });

  // Load PO detail for view modal
  const { data: viewPoDetail } = useQuery({
    queryKey: ['purchase-order-detail', viewPoId],
    queryFn: () => purchasesApi.getOrder(viewPoId),
    enabled: !!viewPoId,
  });

  // Load reception BL detail for view modal
  const { data: viewRecDetail } = useQuery({
    queryKey: ['reception-bl-detail', viewRecId],
    queryFn: () => purchasesApi.getReception(viewRecId),
    enabled: !!viewRecId,
  });

  // ── PO form ───────────────────────────────────────────────────────────────
  const poForm = useForm<PoFormData>({
    resolver: zodResolver(poSchema),
    defaultValues: { orderDate: today, expectedDeliveryDate: today, items: [{ rawMaterialId: '', quantity: 1, unit: '', unitPrice: 0, taxRate: 0 }] },
  });
  const { fields: poFields, append: poAppend, remove: poRemove } = useFieldArray({ control: poForm.control, name: 'items' });

  const createPoMutation = useMutation({
    mutationFn: (d: PoFormData) => purchasesApi.createOrder(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('purchases.orderCreated'), 'success');
      closePo();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const updatePoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PoFormData }) =>
      purchasesApi.updateOrder(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('common.updated'), 'success');
      closePo();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const removePoMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.removeOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('common.deleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const patchStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      purchasesApi.updateOrderStatus(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast(t('common.updated'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreatePo() {
    setEditingPo(null);
    poForm.reset({ orderDate: today, expectedDeliveryDate: today, items: [{ rawMaterialId: '', quantity: 1, unit: 'kg', unitPrice: 0, taxRate: 0 }] });
    setPoModalOpen(true);
  }

  function openEditPo(po: any) {
    setEditingPo(po);
    // Need to load items — fetch detail
    purchasesApi.getOrder(po.id).then((res: any) => {
      const d = res.data;
      poForm.reset({
        supplierId: d.supplierId,
        orderDate: d.orderDate?.split('T')[0] ?? today,
        expectedDeliveryDate: d.expectedDeliveryDate?.split('T')[0] ?? '',
        notes: d.notes ?? '',
        items: (d.items ?? []).map((it: any) => ({
          rawMaterialId: it.rawMaterialId,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          taxRate: Number(it.taxRate ?? 0),
        })),
      });
    });
    setPoModalOpen(true);
  }

  function closePo() {
    setPoModalOpen(false);
    setEditingPo(null);
    poForm.reset();
  }

  function submitPo(d: PoFormData) {
    if (editingPo) {
      updatePoMutation.mutate({ id: editingPo.id, data: d });
    } else {
      createPoMutation.mutate(d);
    }
  }

  // ── Reception form ────────────────────────────────────────────────────────
  const recForm = useForm<RecFormData>({
    resolver: zodResolver(recSchema),
    defaultValues: { receptionDate: today, items: [] },
  });
  const { fields: recFields } = useFieldArray({ control: recForm.control, name: 'items' });

  // When PO detail loads, populate reception items from PO items
  useEffect(() => {
    if (!recPoDetail) return;
    const d = (recPoDetail as any).data;
    const products: any[] = productsData?.data ?? [];
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    recForm.setValue('items', (d.items ?? []).map((it: any) => {
      const prod = productMap.get(it.rawMaterialId);
      return {
        rawMaterialId: it.rawMaterialId,
        productName: prod?.name ?? it.rawMaterialId,
        orderedQty: Number(it.quantity),
        unit: it.unit ?? prod?.unit ?? '',
        quantityReceived: Number(it.quantity),
        costPerUnit: Number(it.unitPrice),
        batchNumber: '',
        expiresAt: '',
      };
    }));
  }, [recPoDetail, productsData]);

  const createRecMutation = useMutation({
    mutationFn: (d: RecFormData) => {
      // Strip display-only fields before sending
      const payload = {
        purchaseOrderId: d.purchaseOrderId,
        receptionDate: d.receptionDate,
        notes: d.notes,
        items: d.items.map(({ rawMaterialId, quantityReceived, costPerUnit, batchNumber, expiresAt }) => ({
          rawMaterialId,
          quantityReceived,
          costPerUnit,
          batchNumber: batchNumber || undefined,
          expiresAt: expiresAt || undefined,
        })),
      };
      return purchasesApi.createReception(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reception-bls'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast(t('purchases.receptionCreated'), 'success');
      closeRec();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openReceptionFor(poId: string) {
    setRecPoId(poId);
    recForm.reset({ receptionDate: today, purchaseOrderId: poId, items: [] });
    setRecModalOpen(true);
  }

  function closeRec() {
    setRecModalOpen(false);
    setRecPoId('');
    recForm.reset();
  }

  const orders = ordersData?.data ?? [];
  const receptions = receptionsData?.data ?? [];
  const pagination = tab === 'orders' ? ordersData?.pagination : receptionsData?.pagination;
  const { visible: poVisible, toggle: poToggle, col: poCol } = useColumnVisibility(
    'purchases_po_visible_columns',
    ['poNumber', 'supplier', 'orderDate', 'expectedDelivery', 'total', 'status'],
  );
  const { visible: recVisible, toggle: recToggle, col: recCol } = useColumnVisibility(
    'purchases_rec_visible_columns',
    ['blNumber', 'poNumber', 'receptionDate', 'totalReceived', 'status'],
  );
  const suppliers = suppliersData?.data ?? [];
  const rawMats = productsData?.data ?? [];
  const suppliersMap = new Map<string, string>(suppliers.map((s: any) => [s.id, s.name]));
  const isLoading = tab === 'orders' ? ordersLoading : receptionsLoading;
  const isPending = createPoMutation.isPending || updatePoMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('purchases.title')}</h1>
        {tab === 'orders' ? (
          <Button onClick={openCreatePo}>
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
        <>
          <div className="flex justify-end">
            <ColumnToggleMenu
              columns={[
                { key: 'poNumber', label: t('purchases.poNumber') },
                { key: 'supplier', label: t('purchases.supplier') },
                { key: 'orderDate', label: t('purchases.orderDate') },
                { key: 'expectedDelivery', label: t('purchases.expectedDelivery') },
                { key: 'total', label: 'Total' },
                { key: 'status', label: t('quotes.status') },
                { key: 'notes', label: 'Notes' },
              ]}
              visible={poVisible}
              onToggle={poToggle}
            />
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {poCol('poNumber') && <th className="text-left px-4 py-3 font-medium">{t('purchases.poNumber')}</th>}
                {poCol('supplier') && <th className="text-left px-4 py-3 font-medium">{t('purchases.supplier')}</th>}
                {poCol('orderDate') && <th className="text-left px-4 py-3 font-medium">{t('purchases.orderDate')}</th>}
                {poCol('expectedDelivery') && <th className="text-left px-4 py-3 font-medium">{t('purchases.expectedDelivery')}</th>}
                {poCol('total') && <th className="text-right px-4 py-3 font-medium">Total</th>}
                {poCol('status') && <th className="text-left px-4 py-3 font-medium">{t('quotes.status')}</th>}
                {poCol('notes') && <th className="text-left px-4 py-3 font-medium">Notes</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                  {poCol('poNumber') && <td className="px-4 py-3 font-mono text-xs">{o.poNumber}</td>}
                  {poCol('supplier') && <td className="px-4 py-3">{suppliersMap.get(o.supplierId) ?? '—'}</td>}
                  {poCol('orderDate') && <td className="px-4 py-3">{formatDate(o.orderDate)}</td>}
                  {poCol('expectedDelivery') && <td className="px-4 py-3">{o.expectedDeliveryDate ? formatDate(o.expectedDeliveryDate) : '—'}</td>}
                  {poCol('total') && <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>}
                  {poCol('status') && <td className="px-4 py-3"><Badge variant={PO_STATUS_VARIANT[o.status] ?? 'muted'}>{t(`status.${o.status}`)}</Badge></td>}
                  {poCol('notes') && <td className="px-4 py-3 text-muted-foreground text-xs">{o.notes || '—'}</td>}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" title="Voir détail"
                        onClick={() => { setViewPoId(o.id); setViewPoOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {o.status === 'draft' && (
                        <Button size="sm" variant="ghost" title="Modifier" onClick={() => openEditPo(o)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {o.status === 'draft' && (
                        <Button size="sm" variant="ghost" title="Valider (envoyer)"
                          onClick={() => patchStatusMutation.mutate({ id: o.id, status: 'sent' })}>
                          <CheckCircle className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {(o.status === 'draft' || o.status === 'sent') && (
                        <Button size="sm" variant="ghost" title="Réceptionner"
                          onClick={() => openReceptionFor(o.id)}>
                          <PackageCheck className="h-4 w-4 text-success" />
                        </Button>
                      )}
                      {o.status === 'draft' && (
                        <Button size="sm" variant="ghost" onClick={() => removePoMutation.mutate(o.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={poVisible.length + 1} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <ColumnToggleMenu
              columns={[
                { key: 'blNumber', label: t('purchases.blNumber') },
                { key: 'poNumber', label: 'Commande' },
                { key: 'receptionDate', label: t('purchases.receptionDate') },
                { key: 'totalReceived', label: t('purchases.totalReceived') },
                { key: 'status', label: t('quotes.status') },
              ]}
              visible={recVisible}
              onToggle={recToggle}
            />
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {recCol('blNumber') && <th className="text-left px-4 py-3 font-medium">{t('purchases.blNumber')}</th>}
                {recCol('poNumber') && <th className="text-left px-4 py-3 font-medium">Commande</th>}
                {recCol('receptionDate') && <th className="text-left px-4 py-3 font-medium">{t('purchases.receptionDate')}</th>}
                {recCol('totalReceived') && <th className="text-right px-4 py-3 font-medium">{t('purchases.totalReceived')}</th>}
                {recCol('status') && <th className="text-left px-4 py-3 font-medium">{t('quotes.status')}</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {receptions.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  {recCol('blNumber') && <td className="px-4 py-3 font-mono text-xs">{r.blNumber}</td>}
                  {recCol('poNumber') && <td className="px-4 py-3 font-mono text-xs">{r.poNumber ?? r.purchaseOrderId}</td>}
                  {recCol('receptionDate') && <td className="px-4 py-3">{formatDate(r.receptionDate)}</td>}
                  {recCol('totalReceived') && <td className="px-4 py-3 text-right">{Number(r.totalQuantityReceived).toFixed(2)}</td>}
                  {recCol('status') && <td className="px-4 py-3"><Badge variant={REC_STATUS_VARIANT[r.status] ?? 'muted'}>{t(`status.${r.status}`)}</Badge></td>}
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" title="Voir détail"
                      onClick={() => { setViewRecId(r.id); setViewRecOpen(true); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {receptions.length === 0 && (
                <tr><td colSpan={recVisible.length + 1} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {pagination && (
        <Pagination page={page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      {/* ── PO Create/Edit Modal ─────────────────────────────────────────── */}
      <Modal open={poModalOpen} onClose={closePo} size="xl"
        title={editingPo ? `Modifier ${editingPo.poNumber}` : t('purchases.newOrder')}>
        <form onSubmit={poForm.handleSubmit(submitPo)} className="space-y-4">
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
                onClick={() => poAppend({ rawMaterialId: '', quantity: 1, unit: '', unitPrice: 0, taxRate: 0 })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            <div className="space-y-2">
              {poFields.map((f, i) => {
                const selectedId = poForm.watch(`items.${i}.rawMaterialId`);
                const selectedProduct = rawMats.find((m: any) => m.id === selectedId);
                const qty = Number(poForm.watch(`items.${i}.quantity`)) || 0;
                const price = Number(poForm.watch(`items.${i}.unitPrice`)) || 0;
                const lineRate = Number(poForm.watch(`items.${i}.taxRate`)) || 0;
                const lineHT = qty * price;
                const lineTVA = lineHT * lineRate / 100;
                const lineTTC = lineHT + lineTVA;
                const taxRates: any[] = (settingsData as any)?.data?.taxRates ?? [];
                return (
                  <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('common.product')}</label>}
                      <Select {...poForm.register(`items.${i}.rawMaterialId`)}
                        className="w-full text-xs"
                        onChange={(e) => {
                          poForm.setValue(`items.${i}.rawMaterialId`, e.target.value);
                          const prod = rawMats.find((m: any) => m.id === e.target.value);
                          if (prod?.unit) poForm.setValue(`items.${i}.unit`, prod.unit);
                          if (prod?.lastCostPerUnit) poForm.setValue(`items.${i}.unitPrice`, Number(prod.lastCostPerUnit));
                        }}>
                        <option value="">{t('common.select')}</option>
                        {rawMats.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </Select>
                    </div>
                    <div className="col-span-1">
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('common.qty')}</label>}
                      <Input type="number" step="0.01" min="0.01"
                        {...poForm.register(`items.${i}.quantity`)} className="text-xs" />
                    </div>
                    <div className="col-span-1">
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('products.unit')}</label>}
                      <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground w-full text-center block">
                        {selectedProduct?.unit ?? poForm.watch(`items.${i}.unit`) ?? '—'}
                      </span>
                      <input type="hidden" {...poForm.register(`items.${i}.unit`)} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('purchases.unitPrice')}</label>}
                      <Input type="number" step="0.01" min="0"
                        {...poForm.register(`items.${i}.unitPrice`)} className="text-xs" />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('purchases.taxRate')}</label>}
                      <Select {...poForm.register(`items.${i}.taxRate`)} className="w-full text-xs">
                        <option value={0}>0%</option>
                        {taxRates.map((tr: any) => (
                          <option key={tr.id} value={tr.rate}>{tr.name} ({tr.rate}%)</option>
                        ))}
                        {taxRates.length === 0 && <option value={19}>TVA 19%</option>}
                      </Select>
                    </div>
                    <div className="col-span-1">
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">TTC</label>}
                      <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted font-medium block text-right">
                        {formatCurrency(lineTTC)}
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {poFields.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => poRemove(i)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals summary */}
          {(() => {
            const watchedItems = poForm.watch('items') ?? [];
            const subtotal = watchedItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
            const taxAmount = watchedItems.reduce((s, it) => {
              const ht = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
              return s + ht * (Number(it.taxRate) || 0) / 100;
            }, 0);
            const total = subtotal + taxAmount;
            return (
              <div className="flex justify-end gap-6 text-sm border-t border-border pt-2">
                <span className="text-muted-foreground">{t('purchases.subtotal')} : <span className="font-medium text-foreground">{formatCurrency(subtotal)}</span></span>
                <span className="text-muted-foreground">{t('purchases.taxAmount')} : <span className="font-medium text-foreground">{formatCurrency(taxAmount)}</span></span>
                <span className="font-semibold">Total TTC : {formatCurrency(total)}</span>
              </div>
            );
          })()}

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...poForm.register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closePo}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── PO View Modal ────────────────────────────────────────────────── */}
      <Modal open={viewPoOpen} onClose={() => { setViewPoOpen(false); setViewPoId(''); }}
        title={`Commande ${(viewPoDetail as any)?.data?.poNumber ?? ''}`}>
        {!viewPoDetail ? <LoadingSpinner /> : (() => {
          const d = (viewPoDetail as any).data;
          return (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Fournisseur :</span> <span className="font-medium">{suppliersMap.get(d.supplierId) ?? '—'}</span></div>
                <div><span className="text-muted-foreground">Statut :</span> <Badge variant={PO_STATUS_VARIANT[d.status] ?? 'muted'} className="ml-1">{t(`status.${d.status}`)}</Badge></div>
                <div><span className="text-muted-foreground">Date commande :</span> {formatDate(d.orderDate)}</div>
                <div><span className="text-muted-foreground">Livraison prévue :</span> {d.expectedDeliveryDate ? formatDate(d.expectedDeliveryDate) : '—'}</div>
              </div>
              {d.notes && <p className="text-muted-foreground italic">{d.notes}</p>}
              <table className="w-full border border-border rounded-md overflow-hidden text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Produit</th>
                    <th className="text-right px-3 py-2">Qté</th>
                    <th className="text-left px-3 py-2">Unité</th>
                    <th className="text-right px-3 py-2">P.U.</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.items ?? []).map((it: any, idx: number) => {
                    const prod = rawMats.find((m: any) => m.id === it.rawMaterialId);
                    return (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-2">{prod?.name ?? it.rawMaterialId}</td>
                        <td className="px-3 py-2 text-right">{Number(it.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2">{prod?.unit ?? it.unit}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(it.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(Number(it.quantity) * Number(it.unitPrice))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-end font-medium">
                Total : {formatCurrency(d.total ?? d.totalAmount)}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Reception BL View Modal ───────────────────────────────────────── */}
      <Modal open={viewRecOpen} onClose={() => { setViewRecOpen(false); setViewRecId(''); }}
        title={`Réception ${(viewRecDetail as any)?.data?.blNumber ?? ''}`}>
        {!viewRecDetail ? <LoadingSpinner /> : (() => {
          const d = (viewRecDetail as any).data;
          return (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Commande :</span> <span className="font-mono">{d.poNumber ?? d.purchaseOrderId}</span></div>
                <div><span className="text-muted-foreground">Date réception :</span> {formatDate(d.receptionDate)}</div>
              </div>
              {d.notes && <p className="text-muted-foreground italic">{d.notes}</p>}
              <table className="w-full border border-border rounded-md overflow-hidden text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Produit</th>
                    <th className="text-right px-3 py-2">Qté reçue</th>
                    <th className="text-left px-3 py-2">Unité</th>
                    <th className="text-right px-3 py-2">Coût/u</th>
                    <th className="text-left px-3 py-2">N° lot</th>
                    <th className="text-left px-3 py-2">Expiration</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.stockEntries ?? d.items ?? []).map((se: any, idx: number) => {
                    const prod = rawMats.find((m: any) => m.id === (se.finishedProductId ?? se.rawMaterialId));
                    return (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-2">{prod?.name ?? se.rawMaterialId}</td>
                        <td className="px-3 py-2 text-right">{Number(se.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2">{prod?.unit ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(se.costPerUnit)}</td>
                        <td className="px-3 py-2">{se.batchNumber ?? '—'}</td>
                        <td className="px-3 py-2">{se.expiresAt ? formatDate(se.expiresAt) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Modal>

      {/* ── Reception Modal ──────────────────────────────────────────────── */}
      <Modal open={recModalOpen} onClose={closeRec} title={t('purchases.newReception')}>
        <form onSubmit={recForm.handleSubmit(d => createRecMutation.mutate(d))} className="space-y-4">
          {/* PO info — read-only when opened from a specific PO */}
          <div>
            <label className="text-sm font-medium">Commande fournisseur</label>
            {recPoId ? (
              <p className="mt-1 px-3 py-2 rounded-md border border-input bg-muted text-sm font-mono">
                {orders.find((o: any) => o.id === recPoId)?.poNumber ?? recPoId}
              </p>
            ) : (
              <Select {...recForm.register('purchaseOrderId')}
                onChange={(e) => { recForm.setValue('purchaseOrderId', e.target.value); setRecPoId(e.target.value); }}
                className="mt-1 w-full">
                <option value="">{t('common.select')}</option>
                {orders.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.poNumber} — {suppliersMap.get(o.supplierId) ?? ''}</option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">{t('purchases.receptionDate')}</label>
            <Input type="date" {...recForm.register('receptionDate')} className="mt-1" />
          </div>

          {/* Articles from PO — no free selection */}
          {recFields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {recPoId ? 'Chargement des articles…' : 'Sélectionnez une commande pour voir les articles'}
            </p>
          ) : (
            <div>
              <label className="text-sm font-medium mb-2 block">Articles de la commande</label>
              <div className="space-y-3">
                {recFields.map((f, i) => (
                  <div key={f.id} className="border border-border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{recForm.watch(`items.${i}.productName`)}</span>
                      <span className="text-xs text-muted-foreground">
                        Commandé : {recForm.watch(`items.${i}.orderedQty`)} {recForm.watch(`items.${i}.unit`)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Qté reçue</label>
                        <Input type="number" step="0.01" min="0.01"
                          {...recForm.register(`items.${i}.quantityReceived`)} className="text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Coût/unité (DA)</label>
                        <Input type="number" step="0.01" min="0"
                          {...recForm.register(`items.${i}.costPerUnit`)} className="text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">N° lot (optionnel)</label>
                        <Input placeholder="N° lot"
                          {...recForm.register(`items.${i}.batchNumber`)} className="text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Date expiration (optionnel)</label>
                        <Input type="date"
                          {...recForm.register(`items.${i}.expiresAt`)} className="text-xs mt-0.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...recForm.register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeRec}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createRecMutation.isPending || recFields.length === 0}>
              {createRecMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
