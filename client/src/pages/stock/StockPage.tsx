import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { stockApi } from '@/lib/api';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function StockPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'inventory' | 'alerts'>('inventory');
  const [page, setPage] = useState(1);

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
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('rawMaterials.name')}</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('stock.quantity')}</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('stock.value')}</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('stock.expiryAlert')}</th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('stock.lowStockAlert')}</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('stock.expiry')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invData?.data?.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
                  )}
                  {invData?.data?.map((item: any) => (
                    <tr key={item.rawMaterialId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{item.rawMaterialName}<span className="text-muted-foreground ml-1 text-xs">({item.unit})</span></td>
                      <td className="px-4 py-3 text-right text-foreground">{formatNumber(item.totalQuantity)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{formatCurrency(item.totalValue)}</td>
                      <td className="px-4 py-3 text-center">
                        {item.expiryAlert === 'red' && <Badge variant="destructive">Urgent</Badge>}
                        {item.expiryAlert === 'orange' && <Badge variant="warning">Bientôt</Badge>}
                        {!item.expiryAlert && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.lowStockAlert
                          ? <Badge variant="warning"><TrendingDown className="h-3 w-3 mr-1" />Bas</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(item.earliestExpirationDate)}</td>
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
    </div>
  );
}
