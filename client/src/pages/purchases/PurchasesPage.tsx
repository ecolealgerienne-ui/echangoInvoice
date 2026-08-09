import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { purchasesApi, suppliersApi, productsApi, settingsApi, resolveApiError } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { enregistrerBlob } from '@/lib/download';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, CheckCircle, Pencil, PackageCheck, Eye, FileDown } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { useScanLignes } from '@/hooks/useScanLignes';
import { BandeauScan } from '@/components/shared/BandeauScan';
import { Link } from 'react-router-dom';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';
import { EtatVide } from '@/components/shared/EtatVide';
import { TableConteneur } from '@/components/ui/DataTable';


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
  function telechargerPdfCommande(id: string, numero: string) {
    purchasesApi.pdfOrder(id)
      .then((blob: Blob) => enregistrerBlob(blob, `${numero}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  function telechargerPdfReception(id: string, numero: string) {
    purchasesApi.pdfReception(id)
      .then((blob: Blob) => enregistrerBlob(blob, `${numero}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

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
  const { fields: poFields, append: poAppend, remove: poRemove, update: poUpdate } =
    useFieldArray({ control: poForm.control, name: 'items' });

  // Saisie par douchette sur la commande d'achat. Le prix proposé est le coût
  // d'achat connu, pas le prix de vente : on achète, on ne vend pas.
  const scanPo = useScanLignes({
    actif: poModalOpen,
    cleProduit: 'rawMaterialId',
    lignes: (poForm.watch('items') ?? []) as any[],
    ajouter: (l) => poAppend(l as any),
    remplacer: (i, l) => poUpdate(i, l as any),
    majQuantite: (i, q) => poForm.setValue(`items.${i}.quantity`, q as any),
    construireLigne: (produit, quantite) => ({
      rawMaterialId: produit.id,
      quantity: quantite,
      unit: produit.unit || '',
      unitPrice: Number(produit.lastCostPerUnit ?? 0),
      taxRate: 0,
    }) as any,
  });

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
  // L'union couvre toutes les colonnes du menu : « notes » est masquée par
  // défaut mais reste activable.
  const { visible: poVisible, toggle: poToggle, col: poCol } = useColumnVisibility<
    'poNumber' | 'supplier' | 'orderDate' | 'expectedDelivery' | 'total' | 'status' | 'notes'
  >(
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>{t('purchases.title')}</h1>
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
          <div className="flex justify-end items-center gap-2">
            <ExportButton dataset="commandes-achat" />
            <ColumnToggleMenu
              columns={[
                { key: 'poNumber', label: t('purchases.poNumber') },
                { key: 'supplier', label: t('purchases.supplier') },
                { key: 'orderDate', label: t('purchases.orderDate') },
                { key: 'expectedDelivery', label: t('purchases.expectedDelivery') },
                { key: 'total', label: t('common.total') },
                { key: 'status', label: t('quotes.status') },
                { key: 'notes', label: t('common.notes') },
              ]}
              visible={poVisible}
              onToggle={poToggle}
            />
          </div>
          <TableConteneur>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {poCol('poNumber') && <th className="text-left px-3 py-2.5">{t('purchases.poNumber')}</th>}
                {poCol('supplier') && <th className="text-left px-3 py-2.5">{t('purchases.supplier')}</th>}
                {poCol('orderDate') && <th className="text-left px-3 py-2.5">{t('purchases.orderDate')}</th>}
                {poCol('expectedDelivery') && <th className="text-left px-3 py-2.5">{t('purchases.expectedDelivery')}</th>}
                {poCol('total') && <th className="text-right px-3 py-2.5">{t('common.total')}</th>}
                {poCol('status') && <th className="text-left px-3 py-2.5">{t('quotes.status')}</th>}
                {poCol('notes') && <th className="text-left px-3 py-2.5">{t('common.notes')}</th>}
                <th className="px-3 py-2.5 text-2xs uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t border-border hover:bg-surface-hover">
                  {poCol('poNumber') && (
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link to={`/purchases/orders/${o.id}`} className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline">
                        {o.poNumber}
                      </Link>
                    </td>
                  )}
                  {poCol('supplier') && <td className="px-3 py-2.5">{suppliersMap.get(o.supplierId) ?? '—'}</td>}
                  {poCol('orderDate') && <td className="px-3 py-2.5">{formatDate(o.orderDate)}</td>}
                  {poCol('expectedDelivery') && <td className="px-3 py-2.5">{o.expectedDeliveryDate ? formatDate(o.expectedDeliveryDate) : '—'}</td>}
                  {poCol('total') && <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{formatCurrency(o.total)}</td>}
                  {poCol('status') && <td className="px-3 py-2.5"><Badge variant={varianteStatut(o.status)}>{t(`status.${o.status}`)}</Badge></td>}
                  {poCol('notes') && <td className="px-3 py-2.5 text-muted-foreground text-xs">{o.notes || '—'}</td>}
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" title={t('purchases.viewDetail')}
                        onClick={() => { setViewPoId(o.id); setViewPoOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" title={t('purchases.pdfOrder')}
                        onClick={() => telechargerPdfCommande(o.id, o.poNumber)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                      {['draft', 'sent'].includes(o.status) && (
                        <Button size="sm" variant="ghost" title={t('common.edit')} onClick={() => openEditPo(o)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {o.status === 'draft' && (
                        <Button size="sm" variant="ghost" title={t('invoices.send')}
                          onClick={() => patchStatusMutation.mutate({ id: o.id, status: 'sent' })}>
                          <CheckCircle className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {['draft', 'sent'].includes(o.status) && (
                        <Button size="sm" variant="ghost" title={t('purchases.receive')}
                          onClick={() => openReceptionFor(o.id)}>
                          <PackageCheck className="h-4 w-4 text-success" />
                        </Button>
                      )}
                      {['draft', 'sent'].includes(o.status) && (
                        <Button size="sm" variant="ghost" title={t('common.delete')} onClick={() => removePoMutation.mutate(o.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={poVisible.length + 1} className="px-4 py-2 text-center text-muted-foreground"><EtatVide /></td></tr>
              )}
            </tbody>
          </table>
          </TableConteneur>
        </>
      ) : (
        <>
          <div className="flex justify-end items-center gap-2">
            <ExportButton dataset="receptions" />
            <ColumnToggleMenu
              columns={[
                { key: 'blNumber', label: t('purchases.blNumber') },
                { key: 'poNumber', label: t('purchases.order') },
                { key: 'receptionDate', label: t('purchases.receptionDate') },
                { key: 'totalReceived', label: t('purchases.totalReceived') },
                { key: 'status', label: t('quotes.status') },
              ]}
              visible={recVisible}
              onToggle={recToggle}
            />
          </div>
          <TableConteneur>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {recCol('blNumber') && <th className="text-left px-3 py-2.5">{t('purchases.blNumber')}</th>}
                {recCol('poNumber') && <th className="text-left px-3 py-2.5">{t('purchases.order')}</th>}
                {recCol('receptionDate') && <th className="text-left px-3 py-2.5">{t('purchases.receptionDate')}</th>}
                {recCol('totalReceived') && <th className="text-right px-3 py-2.5">{t('purchases.totalReceived')}</th>}
                {recCol('status') && <th className="text-left px-3 py-2.5">{t('quotes.status')}</th>}
                <th className="px-3 py-2.5 text-2xs uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {receptions.map((r: any) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-hover">
                  {recCol('blNumber') && (
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link to={`/purchases/receptions/${r.id}`} className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline">
                        {r.blNumber}
                      </Link>
                    </td>
                  )}
                  {recCol('poNumber') && <td className="px-3 py-2.5 font-mono text-xs">{r.poNumber ?? r.purchaseOrderId}</td>}
                  {recCol('receptionDate') && <td className="px-3 py-2.5">{formatDate(r.receptionDate)}</td>}
                  {recCol('totalReceived') && <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{Number(r.totalQuantityReceived).toFixed(2)}</td>}
                  {recCol('status') && <td className="px-3 py-2.5"><Badge variant={varianteStatut(r.status)}>{t(`status.${r.status}`)}</Badge></td>}
                  <td className="px-3 py-2.5">
<div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" title={t('purchases.viewDetail')}
                      onClick={() => { setViewRecId(r.id); setViewRecOpen(true); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                      <Button size="sm" variant="ghost" title={t('purchases.pdfReception')}
                        onClick={() => telechargerPdfReception(r.id, r.blNumber)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {receptions.length === 0 && (
                <tr><td colSpan={recVisible.length + 1} className="px-4 py-2 text-center text-muted-foreground"><EtatVide /></td></tr>
              )}
            </tbody>
          </table>
          </TableConteneur>
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
              <BandeauScan onScan={scanPo.traiter} enCours={scanPo.enCours} dernier={scanPo.dernier} />
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
                  <div key={f.id} className="grid gap-2 items-end" style={{gridTemplateColumns: '2fr 70px 60px 100px 160px 110px 32px'}}>
                    <div>
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
                    <div>
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('common.qty')}</label>}
                      <Input type="number" step="0.01" min="0.01"
                        {...poForm.register(`items.${i}.quantity`)} className="text-xs" />
                    </div>
                    <div>
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('products.unit')}</label>}
                      <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground w-full text-center block">
                        {selectedProduct?.unit ?? poForm.watch(`items.${i}.unit`) ?? '—'}
                      </span>
                      <input type="hidden" {...poForm.register(`items.${i}.unit`)} />
                    </div>
                    <div>
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('purchases.unitPrice')}</label>}
                      <Input type="number" step="0.01" min="0"
                        {...poForm.register(`items.${i}.unitPrice`)} className="text-xs" />
                    </div>
                    <div>
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">{t('purchases.taxRate')}</label>}
                      <Select {...poForm.register(`items.${i}.taxRate`)} className="w-full text-xs">
                        <option value={0}>0%</option>
                        {taxRates.map((tr: any) => (
                          <option key={tr.id} value={tr.rate}>{tr.name} ({tr.rate}%)</option>
                        ))}
                        {taxRates.length === 0 && <option value={19}>TVA 19%</option>}
                      </Select>
                    </div>
                    <div>
                      {i === 0 && <label className="text-xs text-muted-foreground mb-1 block">TTC</label>}
                      <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted font-medium block text-right whitespace-nowrap">
                        {formatCurrency(lineTTC)}
                      </span>
                    </div>
                    <div className="flex justify-center">
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
                <span className="font-semibold">{t('common.totalTtc')} : {formatCurrency(total)}</span>
              </div>
            );
          })()}

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...poForm.register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
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
                <div><span className="text-muted-foreground">{t('purchases.supplier')} :</span> <span className="font-medium">{suppliersMap.get(d.supplierId) ?? '—'}</span></div>
                <div><span className="text-muted-foreground">{t('common.status')} :</span> <Badge variant={varianteStatut(d.status)} className="ml-1">{t(`status.${d.status}`)}</Badge></div>
                <div><span className="text-muted-foreground">{t('purchases.orderDate')} :</span> {formatDate(d.orderDate)}</div>
                <div><span className="text-muted-foreground">{t('purchases.expectedDelivery')} :</span> {d.expectedDeliveryDate ? formatDate(d.expectedDeliveryDate) : '—'}</div>
              </div>
              {d.notes && <p className="text-muted-foreground italic">{d.notes}</p>}
              <table className="w-full border border-border rounded-md overflow-hidden text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.product')}</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.qty')}</th>
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.unit')}</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">P.U.</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.items ?? []).map((it: any, idx: number) => {
                    const prod = rawMats.find((m: any) => m.id === it.rawMaterialId);
                    return (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-2">{prod?.name ?? it.rawMaterialId}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{Number(it.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2">{prod?.unit ?? it.unit}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(it.unitPrice)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(Number(it.quantity) * Number(it.unitPrice))}</td>
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
                <div><span className="text-muted-foreground">{t('purchases.order')} :</span> <span className="font-mono">{d.poNumber ?? d.purchaseOrderId}</span></div>
                <div><span className="text-muted-foreground">{t('purchases.receptionDate')} :</span> {formatDate(d.receptionDate)}</div>
              </div>
              {d.notes && <p className="text-muted-foreground italic">{d.notes}</p>}
              <table className="w-full border border-border rounded-md overflow-hidden text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.product')}</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('purchases.totalReceived')}</th>
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.unit')}</th>
                    <th className="text-right px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('purchases.unitCostShort')}</th>
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">N° lot</th>
                    <th className="text-left px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground">{t('stock.expiry')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.stockEntries ?? d.items ?? []).map((se: any, idx: number) => {
                    const prod = rawMats.find((m: any) => m.id === (se.finishedProductId ?? se.rawMaterialId));
                    return (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-2">{prod?.name ?? se.rawMaterialId}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{Number(se.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2">{prod?.unit ?? '—'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatCurrency(se.costPerUnit)}</td>
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
            <label className="text-sm font-medium">{t('purchases.supplierOrder')}</label>
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
              {recPoId ? t('purchases.loadingItems') : t('purchases.selectOrder')}
            </p>
          ) : (
            <div>
              <label className="text-sm font-medium mb-2 block">{t('purchases.orderItems')}</label>
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
                        <label className="text-xs text-muted-foreground">{t('purchases.totalReceived')}</label>
                        <Input type="number" step="0.01" min="0.01"
                          {...recForm.register(`items.${i}.quantityReceived`)} className="text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{t('purchases.unitCostDa')}</label>
                        <Input type="number" step="0.01" min="0"
                          {...recForm.register(`items.${i}.costPerUnit`)} className="text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">N° lot (optionnel)</label>
                        <Input placeholder="N° lot"
                          {...recForm.register(`items.${i}.batchNumber`)} className="text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{t('purchases.expiryOptional')}</label>
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
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
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
