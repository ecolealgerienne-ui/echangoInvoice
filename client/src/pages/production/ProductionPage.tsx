import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  productionApi, productsApi, resolveApiError,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { varianteMouvement, varianteStatut } from '@/lib/statuts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import {
  Plus, Trash2, Play, CheckCircle, XCircle, Eye, Pencil,
  Factory, ClipboardList, AlertTriangle, TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

// ── Status helpers ────────────────────────────────────────────────────────────

// ── Schemas ───────────────────────────────────────────────────────────────────
const bomLineSchema = z.object({
  rawMaterialId: z.string().uuid({ message: 'production.materialRequired' }),
  quantityPerUnit: z.coerce.number().positive('production.quantityPositive'),
  unit: z.string().min(1, 'production.unitRequired'),
});

const nomenclatureSchema = z.object({
  code: z.string().min(1, 'Code requis').max(50),
  name: z.string().min(2, 'Nom requis').max(255),
  finishedProductId: z.string().uuid({ message: 'production.finishedProductRequired' }),
  description: z.string().optional(),
  lines: z.array(bomLineSchema).min(1, 'Au moins un composant requis'),
});
type NomenclatureFormData = z.infer<typeof nomenclatureSchema>;

const orderSchema = z.object({
  nomenclatureId: z.string().uuid({ message: 'Nomenclature requise' }),
  quantityToProduce: z.coerce.number().positive('production.quantityPositive'),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  notes: z.string().optional(),
});
type OrderFormData = z.infer<typeof orderSchema>;

const completeSchema = z.object({
  quantityProduced: z.coerce.number().positive('production.producedPositive'),
  quantityRejected: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});
type CompleteFormData = z.infer<typeof completeSchema>;

const movementSchema = z.object({
  type: z.enum(['mp_consumption', 'rejection', 'mp_loss']),
  rawMaterialId: z.string().optional(),
  finishedProductId: z.string().optional(),
  quantity: z.coerce.number().positive('production.quantityPositive'),
  unit: z.string().min(1, 'production.unitRequired'),
  reason: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});
type MovementFormData = z.infer<typeof movementSchema>;

const today = new Date().toISOString().split('T')[0];

// ── Main Component ─────────────────────────────────────────────────────────────
export function ProductionPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'nomenclatures' | 'orders'>('orders');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Nomenclature modals
  const [nomModalOpen, setNomModalOpen] = useState(false);
  const [editingNom, setEditingNom] = useState<any>(null);

  // Order modals
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [viewOrderOpen, setViewOrderOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [movModalOpen, setMovModalOpen] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────────
  // Indicateurs affichés au-dessus des onglets : ils valent pour les deux.
  const { data: prodDashboardData } = useQuery({
    queryKey: ['production-dashboard'],
    queryFn: () => productionApi.getDashboard(),
  });

  const { data: nomenclaturesData, isLoading: nomLoading } = useQuery({
    queryKey: ['production-nomenclatures', page, search],
    queryFn: () => productionApi.listNomenclatures({ page, limit: 20, search: search || undefined }),
    enabled: tab === 'nomenclatures',
  });

  // Always-on query for order form BOM selector (independent of active tab)
  const { data: allNomenclaturesData } = useQuery({
    queryKey: ['production-nomenclatures-all'],
    queryFn: () => productionApi.listNomenclatures({ page: 1, limit: 200 }),
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['production-orders', page, search],
    queryFn: () => productionApi.listOrders({ page, limit: 20, search: search || undefined }),
    enabled: tab === 'orders',
  });

  const { data: orderDetailData, isLoading: orderDetailLoading } = useQuery({
    queryKey: ['production-order', viewOrder?.id],
    queryFn: () => productionApi.getOrder(viewOrder.id),
    enabled: !!viewOrder?.id && viewOrderOpen,
  });

  const { data: movementsData } = useQuery({
    queryKey: ['production-movements', viewOrder?.id],
    queryFn: () => productionApi.listMovements(viewOrder.id),
    enabled: !!viewOrder?.id && viewOrderOpen,
  });

  const { data: orderNomenclatureData } = useQuery({
    queryKey: ['nomenclature', viewOrder?.nomenclatureId],
    queryFn: () => productionApi.getNomenclature(viewOrder.nomenclatureId),
    enabled: !!viewOrder?.nomenclatureId && viewOrderOpen,
  });
  const orderNomenclature: any = orderNomenclatureData?.data ?? null;

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productsApi.list({ limit: 200 }),
  });

  // `finished_products` a absorbé `raw_materials` (migration 1709981400000) :
  // les matières sont les articles de type « material » ou « both ». La colonne
  // `bomLine.rawMaterialId` garde son nom mais désigne un article du catalogue.
  const rawMaterials: any[] = (productsData?.data ?? []).filter((p: any) => p.type === 'material' || p.type === 'both');
  const finishedProducts: any[] = (productsData?.data ?? []).filter((p: any) => p.type === 'product' || p.type === 'both');
  const nomenclatures: any[] = nomenclaturesData?.data ?? [];
  const allNomenclatures: any[] = allNomenclaturesData?.data ?? [];
  const orders: any[] = ordersData?.data ?? [];
  const orderDetail: any = orderDetailData?.data ?? viewOrder;
  const movements: any[] = movementsData?.data ?? [];

  // ── Nomenclature form ───────────────────────────────────────────────────────
  const nomForm = useForm<NomenclatureFormData>({
    resolver: zodResolver(nomenclatureSchema),
    defaultValues: { lines: [{ rawMaterialId: '', quantityPerUnit: 1, unit: '' }] },
  });
  const { fields: bomLines, append: appendLine, remove: removeLine } = useFieldArray({
    control: nomForm.control, name: 'lines',
  });

  function openNomCreate() {
    nomForm.reset({ lines: [{ rawMaterialId: '', quantityPerUnit: 1, unit: '' }] });
    setEditingNom(null);
    setNomModalOpen(true);
  }

  function openNomEdit(nom: any) {
    setEditingNom(nom);
    nomForm.reset({
      code: nom.code,
      name: nom.name,
      finishedProductId: nom.finishedProductId,
      description: nom.description ?? '',
      lines: nom.bomLines?.map((l: any) => ({
        rawMaterialId: l.rawMaterialId,
        quantityPerUnit: l.quantityPerUnit,
        unit: l.unit,
      })) ?? [],
    });
    setNomModalOpen(true);
  }

  const createNomMutation = useMutation({
    mutationFn: (data: NomenclatureFormData) => productionApi.createNomenclature(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-nomenclatures'] });
      toast('production.nomenclatureCreated', 'success');
      setNomModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const updateNomMutation = useMutation({
    mutationFn: (data: NomenclatureFormData) => productionApi.updateNomenclature(editingNom.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-nomenclatures'] });
      toast('production.nomenclatureUpdated', 'success');
      setNomModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const deleteNomMutation = useMutation({
    mutationFn: (id: string) => productionApi.deleteNomenclature(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-nomenclatures'] });
      toast('production.nomenclatureDeleted', 'success');
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  function submitNom(data: NomenclatureFormData) {
    editingNom ? updateNomMutation.mutate(data) : createNomMutation.mutate(data);
  }

  // ── Order form ──────────────────────────────────────────────────────────────
  const orderForm = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: { quantityToProduce: 1, priority: 'normal' },
  });

  const createOrderMutation = useMutation({
    mutationFn: (data: OrderFormData) => productionApi.createOrder(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      toast('production.orderCreated', 'success');
      setOrderModalOpen(false);
      orderForm.reset();
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const startOrderMutation = useMutation({
    mutationFn: (id: string) => productionApi.startOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      qc.invalidateQueries({ queryKey: ['production-order', viewOrder?.id] });
      toast('production.orderStarted', 'success');
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  // Complete form
  const completeForm = useForm<CompleteFormData>({
    resolver: zodResolver(completeSchema),
    defaultValues: { quantityRejected: 0 },
  });

  const completeOrderMutation = useMutation({
    mutationFn: (data: CompleteFormData) => productionApi.completeOrder(viewOrder.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      qc.invalidateQueries({ queryKey: ['production-order', viewOrder?.id] });
      toast('production.orderCompleted', 'success');
      setCompleteModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (id: string) => productionApi.cancelOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      qc.invalidateQueries({ queryKey: ['production-order', viewOrder?.id] });
      toast('production.orderCancelled', 'success');
      setCancelModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  // Movement form
  const movForm = useForm<MovementFormData>({
    resolver: zodResolver(movementSchema),
    defaultValues: { type: 'mp_consumption', quantity: 1, unit: '' },
  });
  const movType = movForm.watch('type');

  const createMovMutation = useMutation({
    mutationFn: (data: MovementFormData) => productionApi.createMovement(viewOrder.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-movements', viewOrder?.id] });
      toast('production.movementLogged', 'success');
      setMovModalOpen(false);
      movForm.reset({ type: 'mp_consumption', quantity: 1, unit: '' });
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  // ── Consumption lines (guided BOM table) ────────────────────────────────────
  type ConsLine = {
    rawMaterialId: string;
    name: string;
    plannedQty: number;   // BOM prévu (mp_consumption only)
    alreadyQty: number;   // Σ mouvements passés du même type (read-only)
    newQty: string;       // saisie de ce mouvement
    unit: string;
    isExtra: boolean;
  };
  const [consLines, setConsLines] = useState<ConsLine[]>([]);

  function openBomModal(type: 'mp_consumption' | 'mp_loss') {
    const qty = Number(orderDetail?.quantityToProduce) || 1;
    const alreadyLogged: Record<string, number> = {};
    movements
      .filter((m: any) => m.type === type)
      .forEach((m: any) => {
        alreadyLogged[m.rawMaterialId] = (alreadyLogged[m.rawMaterialId] ?? 0) + Number(m.quantity);
      });
    const bomLines: ConsLine[] = (orderNomenclature?.bomLines ?? []).map((l: any) => {
      const rm = rawMaterials.find((r: any) => r.id === l.rawMaterialId);
      const planned = Number(l.quantityPerUnit) * qty;
      const already = alreadyLogged[l.rawMaterialId] ?? 0;
      const defaultNew = type === 'mp_consumption'
        ? String(Math.max(0, planned - already))
        : '0';
      return {
        rawMaterialId: l.rawMaterialId,
        name: rm?.name ?? l.rawMaterialId,
        plannedQty: planned,
        alreadyQty: already,
        newQty: defaultNew,
        unit: l.unit,
        isExtra: false,
      };
    });
    setConsLines(bomLines);
    movForm.reset({ type, quantity: 1, unit: '' });
    setMovModalOpen(true);
  }

  function openConsumptionModal() { openBomModal('mp_consumption'); }

  function addExtraLine() {
    setConsLines(prev => [...prev, { rawMaterialId: '', name: '', plannedQty: 0, alreadyQty: 0, newQty: '', unit: '', isExtra: true }]);
  }

  function removeExtraLine(idx: number) {
    setConsLines(prev => prev.filter((_, i) => i !== idx));
  }

  const batchMovMutation = useMutation({
    mutationFn: (items: object[]) => productionApi.createMovementBatch(viewOrder.id, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-movements', viewOrder?.id] });
      toast('production.movementLogged', 'success');
      setMovModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  function submitConsumptions() {
    const items = consLines
      .filter(l => l.rawMaterialId && Number(l.newQty) > 0)
      .map(l => ({
        type: movType,
        rawMaterialId: l.rawMaterialId,
        quantity: Number(l.newQty),
        unit: l.unit,
      }));
    if (items.length === 0) {
      toast(t('production.nothingToLog'), 'error');
      return;
    }
    batchMovMutation.mutate(items);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" />
            {t('production.title')}
          </h1>
        </div>
        <Button
          onClick={tab === 'nomenclatures' ? openNomCreate : () => { orderForm.reset({ quantityToProduce: 1, priority: 'normal' }); setOrderModalOpen(true); }}
        >
          <Plus className="h-4 w-4" />
          {tab === 'nomenclatures' ? t('production.newNomenclature') : t('production.newOrder')}
        </Button>
      </div>

      {/* Indicateurs de production */}
      {prodDashboardData?.data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label={t('dashboard.production.ordersInProgress')}
              value={prodDashboardData.data.ordersInProgress}
            />
            <KpiCard
              label={t('dashboard.production.ordersCompletedThisWeek')}
              value={prodDashboardData.data.ordersCompletedThisWeek}
            />
            <KpiCard
              label={t('dashboard.production.averageYield')}
              value={`${prodDashboardData.data.averageYield} %`}
            />
            <KpiCard
              label={t('dashboard.production.costVariance')}
              value={`${formatCurrency(prodDashboardData.data.costVariance.amount)} (${prodDashboardData.data.costVariance.pct} %)`}
              colorClass={prodDashboardData.data.costVariance.amount > 0 ? 'text-destructive' : 'text-success'}
            />
          </div>

          {prodDashboardData.data.criticalStock?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t('dashboard.production.criticalStock')}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {prodDashboardData.data.criticalStock.map((c: any) => (
                  <div key={c.rawMaterial.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-[50%]">{c.rawMaterial.name}</span>
                    <Badge variant={c.available <= 0 ? 'destructive' : 'warning'}>
                      {c.available} {c.rawMaterial.unit}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['orders', 'nomenclatures'] as const).map(t2 => (
          <button
            key={t2}
            onClick={() => { setTab(t2); setPage(1); setSearch(''); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t2
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t2 === 'orders' ? t('production.ordersTitle') : t('production.nomenclaturesTitle')}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
      </div>

      {/* ── NOMENCLATURES TAB ─────────────────────────────────────────────── */}
      {tab === 'nomenclatures' && (
        <>
          {nomLoading ? (
            <LoadingSpinner />
          ) : nomenclatures.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-10 w-10 text-muted-foreground" />}
              message={t('production.noNomenclature')}
            />
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.code')}</th>
                    <th className="text-left px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.name')}</th>
                    <th className="text-left px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.finishedProduct')}</th>
                    <th className="text-right px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.costPerUnit')}</th>
                    <th className="text-center px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</th>
                    <th className="text-right px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {nomenclatures.map((nom: any) => (
                    <tr key={nom.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{nom.code}</td>
                      <td className="px-3 py-2.5 font-medium">{nom.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{nom.finishedProductName ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{formatCurrency(nom.estimatedCostPerUnit)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={varianteStatut(nom.status)}>
                          {String(t(`production.nomStatus.${nom.status}`, nom.status))}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openNomEdit(nom)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteNomMutation.mutate(nom.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nomenclaturesData?.pagination && (
            <Pagination
              page={nomenclaturesData.pagination.page}
              total={nomenclaturesData.pagination.total}
              limit={nomenclaturesData.pagination.limit}
              onChange={setPage}
            />
          )}
        </>
      )}

      {/* ── ORDERS TAB ───────────────────────────────────────────────────── */}
      {tab === 'orders' && (
        <>
          {ordersLoading ? (
            <LoadingSpinner />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Factory className="h-10 w-10 text-muted-foreground" />}
              message={t('production.noOrder')}
            />
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.ref')}</th>
                    <th className="text-left px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.nomenclature')}</th>
                    <th className="text-right px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.quantityToProduce')}</th>
                    <th className="text-center px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</th>
                    <th className="text-right px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.estimatedCost')}</th>
                    <th className="text-center px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.yieldPct')}</th>
                    <th className="text-left px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.plannedStart')}</th>
                    <th className="text-right px-3 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order: any) => (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono font-semibold text-primary">{order.ref}</td>
                      <td className="px-3 py-2.5">{order.nomenclatureName ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{order.quantityToProduce}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Badge variant={varianteStatut(order.status)}>
                            {String(t(`production.status.${order.status}`, order.status))}
                          </Badge>
                          {order.priority === 'urgent' && (
                            <Badge variant="destructive">!</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatCurrency(order.estimatedCost)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {Number(order.yieldPercentage) > 0 ? (
                          <span className={`font-medium ${Number(order.yieldPercentage) >= 90 ? 'text-success' : Number(order.yieldPercentage) >= 70 ? 'text-warning' : 'text-destructive'}`}>
                            {Number(order.yieldPercentage).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {order.plannedStartDate ? formatDate(order.plannedStartDate) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                        <div className="flex items-center justify-end gap-1">
                          {order.status === 'planned' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t('production.startProduction')}
                              onClick={() => { setViewOrder(order); startOrderMutation.mutate(order.id); }}
                              disabled={startOrderMutation.isPending}
                            >
                              <Play className="h-3.5 w-3.5 text-info" />
                            </Button>
                          )}
                          {order.status === 'in_progress' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t('production.completeOrder')}
                              onClick={() => { setViewOrder(order); setCompleteModalOpen(true); }}
                            >
                              <CheckCircle className="h-3.5 w-3.5 text-success" />
                            </Button>
                          )}
                          {(order.status === 'planned' || order.status === 'in_progress') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t('production.cancelOrder')}
                              onClick={() => { setViewOrder(order); setCancelModalOpen(true); }}
                            >
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t('common.view')}
                            onClick={() => { setViewOrder(order); setViewOrderOpen(true); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ordersData?.pagination && (
            <Pagination
              page={ordersData.pagination.page}
              total={ordersData.pagination.total}
              limit={ordersData.pagination.limit}
              onChange={setPage}
            />
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS — NOMENCLATURE
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={nomModalOpen}
        onClose={() => setNomModalOpen(false)}
        title={editingNom ? t('production.nomenclaturesTitle') : t('production.newNomenclature')}
        size="xl"
      >
        <form onSubmit={nomForm.handleSubmit(submitNom)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t('production.code')}</label>
              <Input {...nomForm.register('code')} placeholder={t('production.codePlaceholder')} className="mt-1" />
              {nomForm.formState.errors.code && <p className="text-xs text-destructive mt-1">{nomForm.formState.errors.code.message ? t(nomForm.formState.errors.code.message) : ''}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">{t('production.name')}</label>
              <Input {...nomForm.register('name')} placeholder={t('production.namePlaceholder')} className="mt-1" />
              {nomForm.formState.errors.name && <p className="text-xs text-destructive mt-1">{nomForm.formState.errors.name.message ? t(nomForm.formState.errors.name.message) : ''}</p>}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('production.finishedProduct')}</label>
            <Controller
              control={nomForm.control}
              name="finishedProductId"
              render={({ field }) => (
                <Select value={field.value ?? ''} onChange={field.onChange} className="mt-1">
                  <option value="">{t('common.select')}</option>
                  {finishedProducts.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              )}
            />
            {nomForm.formState.errors.finishedProductId && <p className="text-xs text-destructive mt-1">{nomForm.formState.errors.finishedProductId.message ? t(nomForm.formState.errors.finishedProductId.message) : ''}</p>}
          </div>

          <div>
            <label className="text-sm font-medium">{t('common.description')}</label>
            <textarea
              {...nomForm.register('description')}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Description optionnelle..."
            />
          </div>

          {/* BOM Lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold">{t('production.bomLines')}</label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => appendLine({ rawMaterialId: '', quantityPerUnit: 1, unit: '' })}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('production.addLine')}
              </Button>
            </div>
            {nomForm.formState.errors.lines?.root && (
              <p className="text-xs text-destructive mb-2">{nomForm.formState.errors.lines.root.message ? t(nomForm.formState.errors.lines.root.message) : ''}</p>
            )}
            {/* En-tête colonnes */}
            <div className="grid grid-cols-12 gap-2 px-3 mb-1">
              <div className="col-span-5 text-xs font-medium text-muted-foreground">{t('production.rawMaterial')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('production.qtyPerUnitShort')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('common.unit')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground text-right">{t('production.costPerUnit')}</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-2">
              {bomLines.map((field, idx) => {
                const selRmId = nomForm.watch(`lines.${idx}.rawMaterialId`);
                const qtyPerUnit = Number(nomForm.watch(`lines.${idx}.quantityPerUnit`)) || 0;
                const selRm = rawMaterials.find((r: any) => r.id === selRmId);
                const unitCost = qtyPerUnit * Number(selRm?.lastCostPerUnit ?? 0);
                return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-muted/30 rounded-md">
                  <div className="col-span-5">
                    <Select
                      {...nomForm.register(`lines.${idx}.rawMaterialId`)}
                      onChange={e => {
                        nomForm.setValue(`lines.${idx}.rawMaterialId`, e.target.value);
                        const rm = rawMaterials.find((r: any) => r.id === e.target.value);
                        if (rm?.unit) nomForm.setValue(`lines.${idx}.unit`, rm.unit);
                      }}
                    >
                      <option value="">{t('production.rawMaterial')}...</option>
                      {rawMaterials.map((rm: any) => (
                        <option key={rm.id} value={rm.id}>{rm.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('common.qty')}
                      {...nomForm.register(`lines.${idx}.quantityPerUnit`)}
                    />
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground block text-center truncate">
                      {selRm?.unit ?? '—'}
                    </span>
                    <input type="hidden" {...nomForm.register(`lines.${idx}.unit`)} />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium">
                    {selRm ? formatCurrency(unitCost) : '—'}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeLine(idx)}
                      disabled={bomLines.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
            {/* Totaux */}
            {(() => {
              const totalUnit = bomLines.reduce((sum, _, idx) => {
                const selRmId = nomForm.watch(`lines.${idx}.rawMaterialId`);
                const qtyPerUnit = Number(nomForm.watch(`lines.${idx}.quantityPerUnit`)) || 0;
                const selRm = rawMaterials.find((r: any) => r.id === selRmId);
                return sum + qtyPerUnit * Number(selRm?.lastCostPerUnit ?? 0);
              }, 0);
              return (
                <div className="grid grid-cols-12 gap-2 px-3 pt-2 border-t border-border mt-2">
                  <div className="col-span-9 text-xs font-semibold text-muted-foreground text-right">{t('production.totalPerUnit')}</div>
                  <div className="col-span-2 text-right text-sm font-bold">{formatCurrency(totalUnit)}</div>
                  <div className="col-span-1" />
                </div>
              );
            })()}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setNomModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createNomMutation.isPending || updateNomMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS — CREATE ORDER
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title={t('production.newOrder')}
        size="md"
      >
        <form onSubmit={orderForm.handleSubmit(data => createOrderMutation.mutate(data))} className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t('production.nomenclature')}</label>
            <Controller
              control={orderForm.control}
              name="nomenclatureId"
              render={({ field }) => (
                <Select value={field.value ?? ''} onChange={field.onChange} className="mt-1">
                  <option value="">{t('common.select')}</option>
                  {allNomenclatures.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.name} ({n.code})</option>
                  ))}
                </Select>
              )}
            />
            {orderForm.formState.errors.nomenclatureId && (
              <p className="text-xs text-destructive mt-1">{orderForm.formState.errors.nomenclatureId.message ? t(orderForm.formState.errors.nomenclatureId.message) : ''}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t('production.quantityToProduce')}</label>
              <Input type="number" step="0.01" {...orderForm.register('quantityToProduce')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('production.priorityLabel')}</label>
              <Controller
                control={orderForm.control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onChange={field.onChange} className="mt-1">
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t('production.plannedStart')}</label>
              <Input type="date" {...orderForm.register('plannedStartDate')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('production.plannedEnd')}</label>
              <Input type="date" {...orderForm.register('plannedEndDate')} className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('common.notes')}</label>
            <textarea
              {...orderForm.register('notes')}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOrderModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createOrderMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS — ORDER DETAIL
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={viewOrderOpen}
        onClose={() => setViewOrderOpen(false)}
        title={orderDetail?.ref ?? ''}
        size="xl"
      >
        {orderDetailLoading ? <LoadingSpinner /> : orderDetail ? (
          <div className="space-y-6">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label={t('production.quantityToProduce')} value={orderDetail.quantityToProduce} />
              <KpiCard label={t('production.estimatedCost')} value={formatCurrency(orderDetail.estimatedCost)} />
              <KpiCard
                label={t('production.actualCost')}
                value={Number(orderDetail.actualCost) > 0 ? formatCurrency(orderDetail.actualCost) : '—'}
              />
              <KpiCard
                label={t('production.yieldPct')}
                value={Number(orderDetail.yieldPercentage) > 0 ? `${Number(orderDetail.yieldPercentage).toFixed(1)}%` : '—'}
                colorClass={
                  Number(orderDetail.yieldPercentage) === 0 ? '' :
                  Number(orderDetail.yieldPercentage) >= 90 ? 'text-success' :
                  Number(orderDetail.yieldPercentage) >= 70 ? 'text-warning' : 'text-destructive'
                }
              />
            </div>

            {/* Info row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <InfoRow label={t('production.nomenclature')} value={orderDetail.nomenclatureName ?? '—'} />
                <InfoRow label={t('production.finishedProduct')} value={orderDetail.finishedProductName ?? '—'} />
                <InfoRow label={t('common.status')}>
                  <Badge variant={varianteStatut(orderDetail.status)}>
                    {String(t(`production.status.${orderDetail.status}`, orderDetail.status))}
                  </Badge>
                </InfoRow>
              </div>
              <div className="space-y-1">
                <InfoRow label={t('production.plannedStart')} value={orderDetail.plannedStartDate ? formatDate(orderDetail.plannedStartDate) : '—'} />
                <InfoRow label={t('production.plannedEnd')} value={orderDetail.plannedEndDate ? formatDate(orderDetail.plannedEndDate) : '—'} />
                <InfoRow label={t('production.actualStart')} value={orderDetail.actualStartDate ? formatDate(orderDetail.actualStartDate) : '—'} />
              </div>
            </div>

            {/* Workflow actions */}
            <div className="flex gap-2 flex-wrap">
              {orderDetail.status === 'planned' && (
                <Button
                  onClick={() => startOrderMutation.mutate(orderDetail.id)}
                  disabled={startOrderMutation.isPending}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" />
                  {t('production.startProduction')}
                </Button>
              )}
              {orderDetail.status === 'in_progress' && (
                <>
                  <Button
                    onClick={() => {
                      const rejectionTotal = movements
                        .filter((m: any) => m.type === 'rejection')
                        .reduce((sum: number, m: any) => sum + Number(m.quantity), 0);
                      completeForm.reset({
                        quantityProduced: Number(orderDetail?.quantityToProduce) || undefined,
                        quantityRejected: rejectionTotal,
                      });
                      setCompleteModalOpen(true);
                    }}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t('production.completeProduction')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={openConsumptionModal}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {t('production.logMovement')}
                  </Button>
                </>
              )}
              {(orderDetail.status === 'planned' || orderDetail.status === 'in_progress') && (
                <Button
                  variant="outline"
                  className="gap-2 text-destructive border-destructive hover:bg-destructive/10"
                  onClick={() => setCancelModalOpen(true)}
                >
                  <XCircle className="h-4 w-4" />
                  {t('production.cancelOrder')}
                </Button>
              )}
            </div>

            {/* Production summary */}
            {movements.length > 0 && (() => {
              // Aggregate by type and material
              const consMap: Record<string, { name: string; consumed: number; unit: string }> = {};
              const lossMap: Record<string, { name: string; lost: number; unit: string }> = {};
              let totalRejection = 0;
              let rejectionUnit = '';

              movements.forEach((m: any) => {
                const name = m.rawMaterialName ?? m.finishedProductName ?? m.rawMaterialId ?? '—';
                if (m.type === 'mp_consumption') {
                  const key = m.rawMaterialId ?? name;
                  if (!consMap[key]) consMap[key] = { name, consumed: 0, unit: m.unit };
                  consMap[key].consumed += Number(m.quantity);
                } else if (m.type === 'mp_loss') {
                  const key = m.rawMaterialId ?? name;
                  if (!lossMap[key]) lossMap[key] = { name, lost: 0, unit: m.unit };
                  lossMap[key].lost += Number(m.quantity);
                } else if (m.type === 'rejection') {
                  totalRejection += Number(m.quantity);
                  rejectionUnit = m.unit;
                }
              });

              const qty = Number(orderDetail?.quantityToProduce) || 1;
              const bomMap: Record<string, number> = {};
              (orderNomenclature?.bomLines ?? []).forEach((l: any) => {
                bomMap[l.rawMaterialId] = Number(l.quantityPerUnit) * qty;
              });

              const consRows = Object.entries(consMap);
              const lossRows = Object.entries(lossMap);
              const hasLoss = lossRows.length > 0;
              const hasRejection = totalRejection > 0;

              if (!consRows.length && !hasLoss && !hasRejection) return null;

              return (
                <div className="mb-5 space-y-3">
                  {/* Consommation MP */}
                  {consRows.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Consommation MP</p>
                      <div className="rounded-md border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.material')}</th>
                              <th className="text-right px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.planned')}</th>
                              <th className="text-right px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.consumed')}</th>
                              <th className="text-right px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.variance')}</th>
                              <th className="text-center px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.unit')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {consRows.map(([id, row]) => {
                              const planned = bomMap[id] ?? null;
                              const ecart = planned !== null ? row.consumed - planned : null;
                              return (
                                <tr key={id}>
                                  <td className="px-3 py-1.5 font-medium">{row.name}</td>
                                  <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap tabular-nums">{planned !== null ? planned.toFixed(2) : '—'}</td>
                                  <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap tabular-nums">{row.consumed.toFixed(2)}</td>
                                  <td className={`px-3 py-1.5 text-right text-xs font-medium ${ecart === null ? '' : ecart > 0 ? 'text-warning' : ecart < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                    {ecart === null ? '—' : ecart > 0 ? `+${ecart.toFixed(2)}` : ecart.toFixed(2)}
                                  </td>
                                  <td className="px-3 py-1.5 text-center text-muted-foreground text-xs">{row.unit}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Pertes MP */}
                  {hasLoss && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pertes MP</p>
                      <div className="rounded-md border border-warning/30 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-warning-subtle/60">
                            <tr>
                              <th className="text-left px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.material')}</th>
                              <th className="text-right px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.totalLost')}</th>
                              <th className="text-center px-3 py-1.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.unit')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {lossRows.map(([id, row]) => (
                              <tr key={id}>
                                <td className="px-3 py-1.5 font-medium">{row.name}</td>
                                <td className="px-3 py-1.5 text-right font-semibold text-warning-text whitespace-nowrap tabular-nums">{row.lost.toFixed(2)}</td>
                                <td className="px-3 py-1.5 text-center text-muted-foreground text-xs">{row.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Rejets */}
                  {hasRejection && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/5 text-sm">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rejets</span>
                      <span className="font-semibold text-destructive">{totalRejection.toFixed(2)} {rejectionUnit}</span>
                      <span className="text-muted-foreground text-xs">({((totalRejection / qty) * 100).toFixed(1)}% de la production planifiée)</span>
                    </div>
                  )}

                  <hr className="border-border" />
                </div>
              );
            })()}

            {/* Movements journal */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {t('production.movements')}
              </h3>
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t('production.noMovement')}</p>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.movementType')}</th>
                        <th className="text-left px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.materialOrProduct')}</th>
                        <th className="text-right px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.quantity')}</th>
                        <th className="text-left px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.reason')}</th>
                        <th className="text-left px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.movedAt')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {movements.map((mv: any) => (
                        <tr key={mv.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <Badge variant={varianteMouvement(mv.type)}>
                              {String(t(`production.movType.${mv.type}`, mv.type))}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{mv.rawMaterialName ?? mv.finishedProductName ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums">{mv.quantity} {mv.unit}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{mv.reason ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{mv.movedAt ? formatDate(mv.movedAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS — COMPLETE ORDER
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title={t('production.completeTitle')}
        size="md"
      >
        <form onSubmit={completeForm.handleSubmit(data => completeOrderMutation.mutate(data))} className="space-y-4">
          <div className="p-3 bg-muted/40 rounded-md text-sm text-muted-foreground">
            {t('production.orderLabel')} <span className="font-semibold text-foreground">{viewOrder?.ref}</span> — {t('production.plannedLabel')} <span className="font-semibold text-foreground">{viewOrder?.quantityToProduce}</span> {t('production.units')}
          </div>
          <div>
            <label className="text-sm font-medium">{t('production.quantityProduced')} *</label>
            <Input type="number" step="0.01" {...completeForm.register('quantityProduced')} className="mt-1" />
            {completeForm.formState.errors.quantityProduced && <p className="text-xs text-destructive mt-1">{completeForm.formState.errors.quantityProduced.message ? t(completeForm.formState.errors.quantityProduced.message) : ''}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">{t('production.quantityRejected')}</label>
            <Input type="number" step="0.01" {...completeForm.register('quantityRejected')} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">{t('common.notes')}</label>
            <textarea
              {...completeForm.register('notes')}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setCompleteModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={completeOrderMutation.isPending}>
              <CheckCircle className="h-4 w-4" />
              {t('production.completeProduction')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS — CANCEL ORDER
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title={t('production.cancelTitle')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-md text-sm text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{t('production.cancelWarning')}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={cancelOrderMutation.isPending}
              onClick={() => cancelOrderMutation.mutate(viewOrder?.id)}
            >
              {t('production.cancelOrder')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS — LOG MOVEMENT
      ══════════════════════════════════════════════════════════════════════ */}
      <Modal
        open={movModalOpen}
        onClose={() => setMovModalOpen(false)}
        title={(movType === 'mp_consumption' || movType === 'mp_loss') ? t('production.logConsumption') : t('production.logMovement')}
        size={(movType === 'mp_consumption' || movType === 'mp_loss') ? 'xl' : 'md'}
      >
        {/* ── Type selector (always visible) ── */}
        <div className="mb-5">
          <label className="text-sm font-medium">{t('production.movementType')}</label>
          <Controller
            control={movForm.control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onChange={e => {
                  const newType = e.target.value;
                  field.onChange(e);
                  if (newType === 'mp_consumption' || newType === 'mp_loss') {
                    openBomModal(newType as 'mp_consumption' | 'mp_loss');
                  } else {
                    const fp = finishedProducts.find((p: any) => p.id === orderDetail?.finishedProductId);
                    movForm.setValue('unit', fp?.unit ?? '');
                  }
                }}
                className="mt-1"
              >
                {['mp_consumption', 'rejection', 'mp_loss'].map(type => (
                  <option key={type} value={type}>{t(`production.movType.${type}`)}</option>
                ))}
              </Select>
            )}
          />
        </div>

        {/* ── GUIDED BOM TABLE (mp_consumption / mp_loss) ── */}
        {(movType === 'mp_consumption' || movType === 'mp_loss') && (
          <div className="space-y-4">
            {/* Context banner */}
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md text-sm">
              <span className="text-muted-foreground">Ordre :</span>
              <span className="font-semibold">{viewOrder?.ref}</span>
              <span className="text-muted-foreground ml-2">{t('production.qtyToProduce')}</span>
              <span className="font-semibold">{viewOrder?.quantityToProduce}</span>
            </div>

            {/* BOM lines table */}
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">Composant</th>
                    {movType === 'mp_consumption' && (
                      <th className="text-right px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('production.planned')}</th>
                    )}
                    <th className="text-right px-3 py-2 font-medium text-2xs uppercase tracking-wide text-muted-foreground">
                      {movType === 'mp_loss' ? t('production.totalLost') : t('production.alreadyConsumed')}
                    </th>
                    <th className="text-right px-3 py-2 font-medium  w-36 text-2xs uppercase tracking-wide text-muted-foreground">
                      {movType === 'mp_loss' ? t('production.newLoss') : t('production.toConsume')}
                    </th>
                    <th className="text-center px-3 py-2 font-medium  w-20 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.unit')}</th>
                    <th className="w-8 text-2xs uppercase tracking-wide text-muted-foreground" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {consLines.map((line, idx) => {
                    const newQtyNum = Number(line.newQty) || 0;
                    const hasDeviation = movType === 'mp_consumption' && !line.isExtra &&
                      Math.abs((line.alreadyQty + newQtyNum) - line.plannedQty) > 0.001;
                    return (
                    <tr key={idx} className={line.isExtra ? 'bg-info-subtle/30' : ''}>
                      {/* Composant */}
                      <td className="px-3 py-2">
                        {line.isExtra ? (
                          <Select
                            value={line.rawMaterialId}
                            onChange={e => {
                              const rm = rawMaterials.find((r: any) => r.id === e.target.value);
                              setConsLines(prev => prev.map((l, i) => i === idx ? {
                                ...l,
                                rawMaterialId: e.target.value,
                                name: rm?.name ?? '',
                                unit: rm?.unit ?? l.unit,
                              } : l));
                            }}
                          >
                            <option value="">{t('production.selectOption')}</option>
                            {rawMaterials.map((rm: any) => (
                              <option key={rm.id} value={rm.id}>{rm.name}</option>
                            ))}
                          </Select>
                        ) : (
                          <span className="font-medium">{line.name}</span>
                        )}
                      </td>
                      {/* Prévu (mp_consumption only) */}
                      {movType === 'mp_consumption' && (
                        <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap tabular-nums">
                          {line.isExtra ? '—' : line.plannedQty.toFixed(2)}
                        </td>
                      )}
                      {/* Déjà consommé / Total perdu (read-only) */}
                      <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap tabular-nums">
                        {line.isExtra ? '—' : line.alreadyQty.toFixed(2)}
                      </td>
                      {/* À consommer / Nouvelle perte (editable) */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.newQty}
                          onChange={e => setConsLines(prev => prev.map((l, i) => i === idx ? { ...l, newQty: e.target.value } : l))}
                          className={`text-right ${hasDeviation ? 'border-warning focus:ring-warning' : ''}`}
                        />
                      </td>
                      {/* Unité */}
                      <td className="px-3 py-2 text-center">
                        {line.isExtra ? (
                          <Input
                            value={line.unit}
                            onChange={e => setConsLines(prev => prev.map((l, i) => i === idx ? { ...l, unit: e.target.value } : l))}
                            placeholder="kg"
                            className="text-center w-16"
                          />
                        ) : (
                          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground font-mono">{line.unit}</span>
                        )}
                      </td>
                      {/* Supprimer (extra only) */}
                      <td className="px-2 py-2 text-center">
                        {line.isExtra && (
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeExtraLine(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* Légende écart (mp_consumption only) */}
            {movType === 'mp_consumption' && consLines.some(l => !l.isExtra && Math.abs((l.alreadyQty + (Number(l.newQty) || 0)) - l.plannedQty) > 0.001) && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {t('production.varianceWarning')}
              </p>
            )}

            {/* Bouton hors-BOM */}
            <button
              type="button"
              onClick={addExtraLine}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une consommation hors-BOM
            </button>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setMovModalOpen(false)}>{t('common.cancel')}</Button>
              <Button
                type="button"
                onClick={submitConsumptions}
                disabled={batchMovMutation.isPending}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}

        {/* ── SIMPLE FORM (rejection) ── */}
        {movType !== 'mp_consumption' && movType !== 'mp_loss' && (
          <form onSubmit={movForm.handleSubmit(data => createMovMutation.mutate(data))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('production.quantity')}</label>
                <Input type="number" step="0.01" {...movForm.register('quantity')} className="mt-1" />
                {movForm.formState.errors.quantity && <p className="text-xs text-destructive mt-1">{movForm.formState.errors.quantity.message ? t(movForm.formState.errors.quantity.message) : ''}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">{t('common.unit')}</label>
                <Input {...movForm.register('unit')} placeholder="kg, pcs..." className="mt-1" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">{t('production.reason')}</label>
              <Input {...movForm.register('reason')} placeholder={t('production.reasonPlaceholder')} className="mt-1" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMovModalOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={createMovMutation.isPending}>{t('common.save')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ── Small helper components ────────────────────────────────────────────────────
function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {icon}
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}

function KpiCard({ label, value, colorClass }: { label: string; value: string | number; colorClass?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-0.5 ${colorClass ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="font-medium">{children ?? value}</span>
    </div>
  );
}
