import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { Card, CardContent } from '@/components/ui/Card';

type ReportType = 'sales' | 'purchases' | 'expenses' | 'stock' | 'tax';

export function ReportsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ReportType>('sales');
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['report', tab, dateFrom, dateTo, page],
    queryFn: () => {
      if (tab === 'stock') return reportsApi.stock();
      if (tab === 'tax') return reportsApi.taxSummary({ dateFrom, dateTo });
      return reportsApi[tab]({ dateFrom, dateTo, page, limit: 20 });
    },
    enabled: ready || tab === 'stock',
  });

  const tabs: ReportType[] = ['sales', 'purchases', 'expenses', 'stock', 'tax'];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground">{t('reports.title')}</h1>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {tabs.map(tp => (
          <Button key={tp} variant={tab === tp ? 'default' : 'ghost'} size="sm" onClick={() => { setTab(tp); setReady(false); setPage(1); }}>
            {t(`reports.${tp}`)}
          </Button>
        ))}
      </div>

      {tab !== 'stock' && (
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('reports.dateFrom')}</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('reports.dateTo')}</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={() => { setReady(true); setPage(1); }}>{t('reports.generate')}</Button>
        </div>
      )}

      {isLoading && <LoadingSpinner />}

      {/* Sales */}
      {tab === 'sales' && data?.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'CA TTC', value: formatCurrency(data.data.summary.totalRevenue) },
              { label: 'CA HT', value: formatCurrency(data.data.summary.totalHT) },
              { label: 'Payé', value: formatCurrency(data.data.summary.totalAmountPaid) },
              { label: 'Solde dû', value: formatCurrency(data.data.summary.totalAmountDue) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-bold text-foreground">{s.value}</p></CardContent></Card>
            ))}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">N° Facture</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Client</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Montant TTC</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Solde dû</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.details?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-foreground">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 text-foreground">{r.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.invoiceDate)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrency(r.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrency(r.amountDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}
        </div>
      )}

      {/* Achats */}
      {tab === 'purchases' && data?.data && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {[
              { label: 'Coût total achats', value: formatCurrency(data.data.summary.totalPurchaseCost) },
              { label: 'Réceptions', value: String(data.data.summary.receptionCount) },
              { label: 'Valeur moy. / réception', value: formatCurrency(data.data.summary.averageOrderValue) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
              </CardContent></Card>
            ))}
          </div>

          {/* Par fournisseur */}
          {data.data.bySupplier?.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fournisseur</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Réceptions</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.data.bySupplier.map((r: any) => (
                    <tr key={r.supplierId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.orderCount}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Par matière première */}
          {data.data.byRawMaterial?.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Produit</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qté reçue</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Coût total</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Coût moy./u</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.data.byRawMaterial.map((r: any) => (
                    <tr key={r.rawMaterialId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name} <span className="text-xs text-muted-foreground">({r.unit})</span></td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{r.totalQuantityReceived}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.totalCost)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(r.averageCostPerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Détail réceptions */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">N° BL</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fournisseur</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Montant</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.details?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
                )}
                {data.data.details?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-foreground">{r.blNumber}</td>
                    <td className="px-4 py-3 text-foreground">{r.supplierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.receptionDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.totalAmount)}</td>
                    <td className="px-4 py-3"><Badge variant="success">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}
        </div>
      )}

      {/* Dépenses */}
      {tab === 'expenses' && data?.data && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Total dépenses', value: formatCurrency(data.data.summary.totalExpenses) },
              { label: 'Approuvées', value: formatCurrency(data.data.summary.approvedExpenses) },
              { label: 'En attente', value: formatCurrency(data.data.summary.pendingExpenses) },
              { label: 'Nb dépenses', value: String(data.data.summary.expenseCount) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
              </CardContent></Card>
            ))}
          </div>

          {/* Par catégorie */}
          {data.data.byCategory && Object.keys(data.data.byCategory).length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Catégorie</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nb</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(data.data.byCategory)
                    .filter(([, v]: any) => v.count > 0)
                    .sort(([, a]: any, [, b]: any) => b.total - a.total)
                    .map(([cat, v]: any) => (
                      <tr key={cat} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground capitalize">{cat}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{v.count}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(v.total)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Détail dépenses */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Catégorie</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Montant</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Approuvée</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.details?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
                )}
                {data.data.details?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.expenseDate)}</td>
                    <td className="px-4 py-3 text-foreground">{r.description}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{r.category}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      {r.isApproved
                        ? <Badge variant="success">Oui</Badge>
                        : <Badge variant="warning">Non</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}
        </div>
      )}

      {/* Stock */}
      {tab === 'stock' && data?.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Valeur stock', value: formatCurrency(data.data.summary.totalStockValue) },
              { label: 'Qtés disponibles', value: String(data.data.summary.availableEntries) },
              { label: 'Expirant bientôt', value: String(data.data.summary.expiringSoon) },
              { label: 'Stock bas', value: String(data.data.summary.lowStockItems) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-bold text-foreground">{s.value}</p></CardContent></Card>
            ))}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Matière</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Disponible</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Réservé</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valeur</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Stock bas ?</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.details?.map((r: any) => (
                  <tr key={r.rawMaterialId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name} <span className="text-xs text-muted-foreground">({r.unit})</span></td>
                    <td className="px-4 py-3 text-right text-foreground">{r.availableQuantity}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.reservedQuantity}</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrency(r.stockValue)}</td>
                    <td className="px-4 py-3 text-center">{r.isLowStock ? '⚠️' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Résumé TVA */}
      {tab === 'tax' && data?.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Total HT', value: formatCurrency(data.data.totals.totalHT) },
              { label: 'Total TVA', value: formatCurrency(data.data.totals.totalTax) },
              { label: 'Total TTC', value: formatCurrency(data.data.totals.totalTTC) },
              { label: 'Factures', value: String(data.data.totals.invoiceCount) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-bold text-foreground">{s.value}</p></CardContent></Card>
            ))}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('reports.taxName')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.taxRate')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.htBase')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.taxCollected')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.invoiceCount')}</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.byRate?.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
                )}
                {data.data.byRate?.map((r: any) => (
                  <tr key={r.taxRate} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{r.taxName}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.taxRate}%</td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrency(r.htBase)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.taxCollected)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{r.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.data.byMonth?.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('reports.month')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.htBase')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.taxCollected')}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.data.byMonth.map((r: any) => (
                    <tr key={r.month} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.month}</td>
                      <td className="px-4 py-3 text-right text-foreground">{formatCurrency(r.htBase)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(r.taxCollected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
