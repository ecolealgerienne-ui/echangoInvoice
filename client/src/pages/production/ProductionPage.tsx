import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  productionApi, rawMaterialsApi, productsApi, resolveApiError,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
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
const ORDER_STATUS_VARIANT: Record<string, any> = {
  planned: 'muted',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'destructive',
};
const NOM_STATUS_VARIANT: Record<string, any> = {
  active: 'success',
  inactive: 'warning',
  archived: 'muted',
};
const MOV_TYPE_VARIANT: Record<string, any> = {
  mp_consumption: 'info',
  pf_production: 'success',
  rejection: 'destructive',
  mp_loss: 'warning',
};

// ── Schemas ───────────────────────────────────────────────────────────────────
const bomLineSchema = z.object({
  rawMaterialId: z.string().uuid({ message: 'Matière première requise' }),
  quantityPerUnit: z.coerce.number().positive('Quantité > 0'),
  unit: z.string().min(1, 'Unité requise'),
});

const nomenclatureSchema = z.object({
  code: z.string().min(1, 'Code requis').max(50),
  name: z.string().min(2, 'Nom requis').max(255),
  finishedProductId: z.string().uuid({ message: 'Produit fini requis' }),
  description: z.string().optional(),
  lines: z.array(bomLineSchema).min(1, 'Au moins un composant requis'),
});
type NomenclatureFormData = z.infer<typeof nomenclatureSchema>;

const orderSchema = z.object({
  nomenclatureId: z.string().uuid({ message: 'Nomenclature requise' }),
  quantityToProduce: z.coerce.number().positive('Quantité > 0'),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  notes: z.string().optional(),
});
type OrderFormData = z.infer<typeof orderSchema>;

const completeSchema = z.object({
  quantityProduced: z.coerce.number().positive('Quantité produite > 0'),
  quantityRejected: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});
type CompleteFormData = z.infer<typeof completeSchema>;

const movementSchema = z.object({
  type: z.enum(['mp_consumption', 'pf_production', 'rejection', 'mp_loss']),
  rawMaterialId: z.string().optional(),
  finishedProductId: z.string().optional(),
  quantity: z.coerce.number().positive('Quantité > 0'),
  unit: z.string().min(1, 'Unité requise'),
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
  const { data: nomenclaturesData, isLoading: nomLoading } = useQuery({
    queryKey: ['production-nomenclatures', page, search],
    queryFn: () => productionApi.listNomenclatures({ page, limit: 20, search: search || undefined }),
    enabled: tab === 'nomenclatures',
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

  const { data: rawMaterialsData } = useQuery({
    queryKey: ['raw-materials-all'],
    queryFn: () => rawMaterialsApi.list({ limit: 200 }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productsApi.list({ limit: 200 }),
  });

  const rawMaterials: any[] = rawMaterialsData?.data ?? [];
  const finishedProducts: any[] = (productsData?.data ?? []).filter((p: any) => p.type === 'product' || p.type === 'both');
  const nomenclatures: any[] = nomenclaturesData?.data ?? [];
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
      toast(t('production.nomenclatureCreated'), 'success');
      setNomModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const updateNomMutation = useMutation({
    mutationFn: (data: NomenclatureFormData) => productionApi.updateNomenclature(editingNom.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-nomenclatures'] });
      toast(t('production.nomenclatureUpdated'), 'success');
      setNomModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const deleteNomMutation = useMutation({
    mutationFn: (id: string) => productionApi.deleteNomenclature(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-nomenclatures'] });
      toast(t('production.nomenclatureDeleted'), 'success');
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
      toast(t('production.orderCreated'), 'success');
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
      toast(t('production.orderStarted'), 'success');
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
      toast(t('production.orderCompleted'), 'success');
      setCompleteModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (id: string) => productionApi.cancelOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      qc.invalidateQueries({ queryKey: ['production-order', viewOrder?.id] });
      toast(t('production.orderCancelled'), 'success');
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
      toast(t('production.movementLogged'), 'success');
      setMovModalOpen(false);
      movForm.reset({ type: 'mp_consumption', quantity: 1, unit: '' });
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  // ── Consumption lines (guided BOM table) ────────────────────────────────────
  type ConsLine = {
    rawMaterialId: string;
    name: string;
    plannedQty: number;
    consumedQty: string;
    unit: string;
    isExtra: boolean;
  };
  const [consLines, setConsLines] = useState<ConsLine[]>([]);

  function openConsumptionModal() {
    const qty = Number(orderDetail?.quantityToProduce) || 1;
    const alreadyConsumed: Record<string, number> = {};
    movements
      .filter((m: any) => m.type === 'mp_consumption')
      .forEach((m: any) => {
        alreadyConsumed[m.rawMaterialId] = (alreadyConsumed[m.rawMaterialId] ?? 0) + Number(m.quantity);
      });
    const bomLines: ConsLine[] = (orderNomenclature?.bomLines ?? []).map((l: any) => {
      const rm = rawMaterials.find((r: any) => r.id === l.rawMaterialId);
      const planned = Number(l.quantityPerUnit) * qty;
      const remaining = Math.max(0, planned - (alreadyConsumed[l.rawMaterialId] ?? 0));
      return {
        rawMaterialId: l.rawMaterialId,
        name: rm?.name ?? l.rawMaterialId,
        plannedQty: planned,
        consumedQty: String(remaining),
        unit: l.unit,
        isExtra: false,
      };
    });
    setConsLines(bomLines);
    movForm.reset({ type: 'mp_consumption', quantity: 1, unit: '' });
    setMovModalOpen(true);
  }

  function addExtraLine() {
    setConsLines(prev => [...prev, { rawMaterialId: '', name: '', plannedQty: 0, consumedQty: '', unit: '', isExtra: true }]);
  }

  function removeExtraLine(idx: number) {
    setConsLines(prev => prev.filter((_, i) => i !== idx));
  }

  const batchMovMutation = useMutation({
    mutationFn: (items: object[]) => productionApi.createMovementBatch(viewOrder.id, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-movements', viewOrder?.id] });
      toast(t('production.movementLogged'), 'success');
      setMovModalOpen(false);
    },
    onError: (e: any) => toast(resolveApiError(e, t), 'error'),
  });

  function submitConsumptions() {
    const items = consLines
      .filter(l => l.rawMaterialId && Number(l.consumedQty) > 0)
      .map(l => ({
        type: 'mp_consumption',
        rawMaterialId: l.rawMaterialId,
        quantity: Number(l.consumedQty),
        unit: l.unit,
      }));
    if (items.length === 0) {
      toast('Aucune consommation à enregistrer', 'error');
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
              message="Aucune nomenclature. Créez votre première BOM pour définir la recette d'un produit fini."
            />
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('production.code')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('production.name')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('production.finishedProduct')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Coût / unité</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {nomenclatures.map((nom: any) => (
                    <tr key={nom.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{nom.code}</td>
                      <td className="px-4 py-3 font-medium">{nom.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{nom.finishedProductName ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(nom.estimatedCostPerUnit)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={NOM_STATUS_VARIANT[nom.status] ?? 'muted'}>
                          {String(t(`production.nomStatus.${nom.status}`, nom.status))}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
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
              message="Aucun ordre de production. Créez un ordre à partir d'une nomenclature existante."
            />
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('production.ref')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('production.nomenclature')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('production.quantityToProduce')}</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('production.estimatedCost')}</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">{t('production.yieldPct')}</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('production.plannedStart')}</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order: any) => (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-primary">{order.ref}</td>
                      <td className="px-4 py-3">{order.nomenclatureName ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{order.quantityToProduce}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Badge variant={ORDER_STATUS_VARIANT[order.status] ?? 'muted'}>
                            {String(t(`production.status.${order.status}`, order.status))}
                          </Badge>
                          {order.priority === 'urgent' && (
                            <Badge variant="destructive">!</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(order.estimatedCost)}</td>
                      <td className="px-4 py-3 text-center">
                        {Number(order.yieldPercentage) > 0 ? (
                          <span className={`font-medium ${Number(order.yieldPercentage) >= 90 ? 'text-green-600' : Number(order.yieldPercentage) >= 70 ? 'text-yellow-600' : 'text-destructive'}`}>
                            {Number(order.yieldPercentage).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {order.plannedStartDate ? formatDate(order.plannedStartDate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {order.status === 'planned' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t('production.startProduction')}
                              onClick={() => { setViewOrder(order); startOrderMutation.mutate(order.id); }}
                              disabled={startOrderMutation.isPending}
                            >
                              <Play className="h-3.5 w-3.5 text-blue-600" />
                            </Button>
                          )}
                          {order.status === 'in_progress' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t('production.completeOrder')}
                              onClick={() => { setViewOrder(order); setCompleteModalOpen(true); }}
                            >
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
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
              <Input {...nomForm.register('code')} placeholder="NOM-001" className="mt-1" />
              {nomForm.formState.errors.code && <p className="text-xs text-destructive mt-1">{nomForm.formState.errors.code.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">{t('production.name')}</label>
              <Input {...nomForm.register('name')} placeholder="Nom de la nomenclature" className="mt-1" />
              {nomForm.formState.errors.name && <p className="text-xs text-destructive mt-1">{nomForm.formState.errors.name.message}</p>}
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
            {nomForm.formState.errors.finishedProductId && <p className="text-xs text-destructive mt-1">{nomForm.formState.errors.finishedProductId.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium">{t('common.description')}</label>
            <textarea
              {...nomForm.register('description')}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              <p className="text-xs text-destructive mb-2">{nomForm.formState.errors.lines.root.message}</p>
            )}
            {/* En-tête colonnes */}
            <div className="grid grid-cols-12 gap-2 px-3 mb-1">
              <div className="col-span-5 text-xs font-medium text-muted-foreground">Matière première</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">Qté / unité</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">Unité</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground text-right">Coût / unité</div>
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
                      placeholder="Qté"
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
                  <div className="col-span-9 text-xs font-semibold text-muted-foreground text-right">Total / unité produite</div>
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
                  {nomenclatures.map((n: any) => (
                    <option key={n.id} value={n.id}>{n.name} ({n.code})</option>
                  ))}
                </Select>
              )}
            />
            {orderForm.formState.errors.nomenclatureId && (
              <p className="text-xs text-destructive mt-1">{orderForm.formState.errors.nomenclatureId.message}</p>
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
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  Number(orderDetail.yieldPercentage) >= 90 ? 'text-green-600' :
                  Number(orderDetail.yieldPercentage) >= 70 ? 'text-yellow-600' : 'text-destructive'
                }
              />
            </div>

            {/* Info row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <InfoRow label={t('production.nomenclature')} value={orderDetail.nomenclatureName ?? '—'} />
                <InfoRow label={t('production.finishedProduct')} value={orderDetail.finishedProductName ?? '—'} />
                <InfoRow label={t('common.status')}>
                  <Badge variant={ORDER_STATUS_VARIANT[orderDetail.status] ?? 'muted'}>
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
                    onClick={() => { completeForm.reset({ quantityRejected: 0 }); setCompleteModalOpen(true); }}
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

            {/* Movements journal */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {t('production.movements')}
              </h3>
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Aucun mouvement enregistré.</p>
              ) : (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('production.movementType')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Matière / Produit</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t('production.quantity')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('production.reason')}</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('production.movedAt')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {movements.map((mv: any) => (
                        <tr key={mv.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <Badge variant={MOV_TYPE_VARIANT[mv.type] ?? 'muted'}>
                              {String(t(`production.movType.${mv.type}`, mv.type))}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{mv.rawMaterialName ?? mv.finishedProductName ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">{mv.quantity} {mv.unit}</td>
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
            Ordre : <span className="font-semibold text-foreground">{viewOrder?.ref}</span> — Planifié : <span className="font-semibold text-foreground">{viewOrder?.quantityToProduce}</span> unités
          </div>
          <div>
            <label className="text-sm font-medium">{t('production.quantityProduced')} *</label>
            <Input type="number" step="0.01" {...completeForm.register('quantityProduced')} className="mt-1" />
            {completeForm.formState.errors.quantityProduced && <p className="text-xs text-destructive mt-1">{completeForm.formState.errors.quantityProduced.message}</p>}
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
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            <span>Les réservations de stock seront libérées. Cette action est irréversible.</span>
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
        title={movType === 'mp_consumption' ? t('production.logConsumption') : t('production.logMovement')}
        size={movType === 'mp_consumption' ? 'xl' : 'md'}
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
                  field.onChange(e);
                  if (e.target.value === 'mp_consumption') openConsumptionModal();
                }}
                className="mt-1"
              >
                {['mp_consumption', 'pf_production', 'rejection', 'mp_loss'].map(type => (
                  <option key={type} value={type}>{t(`production.movType.${type}`)}</option>
                ))}
              </Select>
            )}
          />
        </div>

        {/* ── GUIDED CONSUMPTION TABLE (mp_consumption) ── */}
        {movType === 'mp_consumption' && (
          <div className="space-y-4">
            {/* Context banner */}
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md text-sm">
              <span className="text-muted-foreground">Ordre :</span>
              <span className="font-semibold">{viewOrder?.ref}</span>
              <span className="text-muted-foreground ml-2">Qté à produire :</span>
              <span className="font-semibold">{viewOrder?.quantityToProduce}</span>
            </div>

            {/* BOM lines table */}
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Composant</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Prévu</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-36">Consommé</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">Unité</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {consLines.map((line, idx) => (
                    <tr key={idx} className={line.isExtra ? 'bg-blue-50/30' : ''}>
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
                            <option value="">— Sélectionner —</option>
                            {rawMaterials.map((rm: any) => (
                              <option key={rm.id} value={rm.id}>{rm.name}</option>
                            ))}
                          </Select>
                        ) : (
                          <span className="font-medium">{line.name}</span>
                        )}
                      </td>
                      {/* Prévu */}
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {line.isExtra ? '—' : line.plannedQty.toFixed(2)}
                      </td>
                      {/* Consommé */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.consumedQty}
                          onChange={e => setConsLines(prev => prev.map((l, i) => i === idx ? { ...l, consumedQty: e.target.value } : l))}
                          className={`text-right ${!line.isExtra && Number(line.consumedQty) !== line.plannedQty ? 'border-amber-400 focus:ring-amber-400' : ''}`}
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Légende écart */}
            {consLines.some(l => !l.isExtra && Number(l.consumedQty) !== l.plannedQty) && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Écart entre prévu et consommé
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

        {/* ── SIMPLE FORM (other movement types) ── */}
        {movType !== 'mp_consumption' && (
          <form onSubmit={movForm.handleSubmit(data => createMovMutation.mutate(data))} className="space-y-4">
            {movType === 'mp_loss' && (
              <div>
                <label className="text-sm font-medium">{t('production.rawMaterial')}</label>
                <Controller
                  control={movForm.control}
                  name="rawMaterialId"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onChange={field.onChange} className="mt-1">
                      <option value="">{t('common.select')}</option>
                      {rawMaterials.map((rm: any) => (
                        <option key={rm.id} value={rm.id}>{rm.name}</option>
                      ))}
                    </Select>
                  )}
                />
              </div>
            )}

            {(movType === 'pf_production' || movType === 'rejection') && (
              <div>
                <label className="text-sm font-medium">{t('production.finishedProduct')}</label>
                <Controller
                  control={movForm.control}
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
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t('production.quantity')}</label>
                <Input type="number" step="0.01" {...movForm.register('quantity')} className="mt-1" />
                {movForm.formState.errors.quantity && <p className="text-xs text-destructive mt-1">{movForm.formState.errors.quantity.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">{t('common.unit')}</label>
                <Input {...movForm.register('unit')} placeholder="kg, pcs..." className="mt-1" />
              </div>
            </div>

            {(movType === 'rejection' || movType === 'mp_loss') && (
              <div>
                <label className="text-sm font-medium">{t('production.reason')} *</label>
                <Input {...movForm.register('reason')} placeholder="Ex: Défaut qualité, Évaporation..." className="mt-1" />
              </div>
            )}

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
