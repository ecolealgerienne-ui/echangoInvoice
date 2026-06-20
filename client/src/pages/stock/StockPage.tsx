import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { stockApi } from '@/lib/api';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Clock, TrendingDown, Pencil } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

const REASONS = ['physical_count', 'correction', 'loss', 'breakage', 'other'] as const;

const adjustSchema = z.object({
  newQuantity: z.coerce.number().min(0, 'Quantité invalide'),
  reason: z.enum(REASONS),
  notes: z.string().optional(),
});
type AdjustForm = z.infer<typeof adjustSchema>;

export function StockPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<'inventory' | 'alerts'>('inventory');
  const [page, setPage] = useState(1);
  const [adjustTarget, setAdjustTarget] = useState<any | null>(null);
  const { visible, toggle, col } = useColumnVisibility(
    'stock_visible_columns',
    ['name', 'quantity', 'value', 'expiryAlert', 'lowStockAlert', 'expiry'],
  );

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ['stock-inventory', page],
    queryFn: () => stockApi.inventory({ page, limit: 20 }),
    enabled: tab === 'inventory',
  });

  const { data: alertData, isLoading: alertLoading } = useQuery({
    queryKey: ['stock-alerts'],
    queryFn: () => stockApi.alerts(),
    enabled: tab === 'alerts',
  });

  const adjustForm = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { reason: 'physical_count', notes: '' },
  });

  const adjustMutation = useMutation({
    mutationFn: (data: AdjustForm) => {
      const delta = data.newQuantity - (adjustTarget?.totalQuantity ?? 0);
      return stockApi.adjust({
        rawMaterialId: adjustTarget.rawMaterialId,
        quantityAdjustment: Math.round(delta * 100) / 100,
        reason: data.reason,
        notes: data.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-alerts'] });
      toast(t('stock.adjusted'), 'success');
      setAdjustTarget(null);
      adjustForm.reset({ reason: 'physical_count', notes: '' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message;
      toast(msg ? t(`errors.${msg}`) : t('errors.generic'), 'error');
    },
  });

  function openAdjust(item: any) {
    setAdjustTarget(item);
    adjustForm.reset({ newQuantity: item.totalQuantity, reason: 'physical_count', notes: '' });
  }

  const newQty = adjustForm.watch('newQuantity');
  const delta = adjustTarget ? (Number(newQty) || 0) - adjustTarget.totalQuantity : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('stock.title')}</h1>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <Button variant={tab === 'inventory' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('inventory')}>
            {t('stock.inventory')}
          </Button>
          <Button variant={tab === 'alerts' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('alerts')}>
            {t('stock.alerts')}
          </Button>
        </div>
      </div>

      {tab === 'inventory' && (
        invLoading ? <LoadingSpinner /> : (
          <>
            <div className="flex justify-end">
              <ColumnToggleMenu
                columns={[
                  { key: 'name', label: t('rawMaterials.name') },
                  { key: 'quantity', label: t('stock.quantity') },
                  { key: 'value', label: t('stock.value') },
                  { key: 'expiryAlert', label: t('stock.expiryAlert') },
                  { key: 'lowStockAlert', label: t('stock.lowStockAlert') },
                  { key: 'expiry', label: t('stock.expiry') },
                ]}
                visible={visible}
                onToggle={toggle}
              />
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {col('name') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('rawMaterials.name')}</th>}
                    {col('quantity') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('stock.quantity')}</th>}
                    {col('value') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('stock.value')}</th>}
                    {col('expiryAlert') && <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('stock.expiryAlert')}</th>}
                    {col('lowStockAlert') && <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('stock.lowStockAlert')}</th>}
                    {col('expiry') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('stock.expiry')}</th>}
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invData?.data?.length === 0 && (
                    <tr><td colSpan={visible.length + 1} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
                  )}
                  {invData?.data?.map((item: any) => (
                    <tr key={item.rawMaterialId} className={`hover:bg-muted/30 transition-colors${item.totalQuantity === 0 ? ' opacity-60' : ''}`}>
                      {col('name') && <td className="px-4 py-3 font-medium text-foreground">{item.rawMaterialName}<span className="text-muted-foreground ml-1 text-xs">({item.unit})</span></td>}
                      {col('quantity') && <td className="px-4 py-3 text-right text-foreground">{formatNumber(item.totalQuantity)}</td>}
                      {col('value') && <td className="px-4 py-3 text-right text-foreground">{formatCurrency(item.totalValue)}</td>}
                      {col('expiryAlert') && <td className="px-4 py-3 text-center">
                        {item.expiryAlert === 'red' && <Badge variant="destructive">Urgent</Badge>}
                        {item.expiryAlert === 'orange' && <Badge variant="warning">Bientôt</Badge>}
                        {!item.expiryAlert && <span className="text-muted-foreground">—</span>}
                      </td>}
                      {col('lowStockAlert') && <td className="px-4 py-3 text-center">
                        {item.lowStockAlert
                          ? <Badge variant="warning"><TrendingDown className="h-3 w-3 mr-1" />Bas</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>}
                      {col('expiry') && <td className="px-4 py-3 text-muted-foreground">{formatDate(item.earliestExpirationDate)}</td>}
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => openAdjust(item)} title={t('stock.adjust')}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invData?.pagination && (
              <Pagination page={page} total={invData.pagination.total} limit={invData.pagination.limit} onChange={setPage} />
            )}
          </>
        )
      )}

      {tab === 'alerts' && (
        alertLoading ? <LoadingSpinner /> : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" /> {t('dashboard.expiringSoon')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {alertData?.data?.expiringSoon?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
                )}
                <div className="space-y-2">
                  {alertData?.data?.expiringSoon?.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-foreground">{a.rawMaterialName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.expiresAt)} — {a.daysUntilExpiry}j</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={a.severity === 'red' ? 'destructive' : 'warning'}>{a.severity}</Badge>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatNumber(a.quantityAtRisk)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" /> {t('dashboard.lowStock')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {alertData?.data?.lowStock?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
                )}
                <div className="space-y-2">
                  {alertData?.data?.lowStock?.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-foreground">{a.rawMaterialName}</p>
                        <p className="text-xs text-muted-foreground">{t('stock.threshold')}: {a.stockThreshold} {a.unit}</p>
                      </div>
                      <Badge variant="warning">{formatNumber(a.totalQuantity)} {a.unit}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      )}

      {/* Adjust Stock Modal */}
      <Modal
        open={!!adjustTarget}
        onClose={() => { setAdjustTarget(null); adjustForm.reset(); }}
        title={t('stock.adjust')}
      >
        {adjustTarget && (
          <form onSubmit={adjustForm.handleSubmit((d) => adjustMutation.mutate(d))} className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium text-foreground">{adjustTarget.rawMaterialName}</p>
              <p className="text-muted-foreground">{t('stock.currentQty')}: <span className="font-semibold text-foreground">{formatNumber(adjustTarget.totalQuantity)} {adjustTarget.unit}</span></p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('stock.newQuantity')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                {...adjustForm.register('newQuantity')}
              />
              {adjustForm.formState.errors.newQuantity && (
                <p className="text-xs text-destructive mt-1">{adjustForm.formState.errors.newQuantity.message}</p>
              )}
              {delta !== 0 && (
                <p className={`text-xs mt-1 font-medium ${delta > 0 ? 'text-green-600' : 'text-destructive'}`}>
                  {delta > 0 ? '+' : ''}{Math.round(delta * 100) / 100} {adjustTarget.unit}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('stock.adjustReason')}</label>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                {...adjustForm.register('reason')}
              >
                {REASONS.map(r => (
                  <option key={r} value={r}>{t(`stock.reasons.${r}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">{t('common.notes')}</label>
              <textarea
                rows={2}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                {...adjustForm.register('notes')}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => { setAdjustTarget(null); adjustForm.reset(); }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={delta === 0 || adjustMutation.isPending}>
                {adjustMutation.isPending ? t('common.loading') : t('stock.applyAdjustment')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
