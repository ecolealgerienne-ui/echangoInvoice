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

type ReportType = 'sales' | 'purchases' | 'expenses' | 'stock' | 'tax' | 'agedBalance';

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
      // La balance est arrêtée à aujourd'hui : une période n'aurait pas de sens,
      // le retard se mesure par rapport à la date du jour.
      if (tab === 'agedBalance') return reportsApi.balanceAgee();
      if (tab === 'tax') return reportsApi.taxSummary({ dateFrom, dateTo });
      return reportsApi[tab]({ dateFrom, dateTo, page, limit: 20 });
    },
    enabled: ready || tab === 'stock' || tab === 'agedBalance',
  });

  const tabs: ReportType[] = ['sales', 'purchases', 'expenses', 'stock', 'tax', 'agedBalance'];

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

      {tab !== 'stock' && tab !== 'agedBalance' && (
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
              { label: t('reports.paid'), value: formatCurrency(data.data.summary.totalAmountPaid) },
              { label: t('reports.due'), value: formatCurrency(data.data.summary.totalAmountDue) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-bold text-foreground">{s.value}</p></CardContent></Card>
            ))}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('reports.invoiceNumber')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.customer')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.date')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.amount')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.due')}</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.details?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-foreground">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 text-foreground">{r.customerName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(r.invoiceDate)}</td>
                    <td className="px-4 py-3 text-right text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.amountDue)}</td>
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
              { label: t('reports.totalPurchaseCost'), value: formatCurrency(data.data.summary.totalPurchaseCost) },
              { label: t('reports.receptions'), value: String(data.data.summary.receptionCount) },
              { label: t('reports.avgReceptionValue'), value: formatCurrency(data.data.summary.averageOrderValue) },
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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('purchases.supplier')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.receptions')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.total')}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.data.bySupplier.map((r: any) => (
                    <tr key={r.supplierId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{r.orderCount}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.totalAmount)}</td>
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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.product')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('purchases.totalReceived')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.totalCost')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('reports.avgUnitCost')}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {data.data.byRawMaterial.map((r: any) => (
                    <tr key={r.rawMaterialId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name} <span className="text-xs text-muted-foreground">({r.unit})</span></td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{r.totalQuantityReceived}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.totalCost)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.averageCostPerUnit)}</td>
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('purchases.supplier')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.date')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.amount')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.status')}</th>
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
                    <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.totalAmount)}</td>
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
              { label: t('reports.totalExpenses'), value: formatCurrency(data.data.summary.totalExpenses) },
              { label: t('reports.approvedAmount'), value: formatCurrency(data.data.summary.approvedExpenses) },
              { label: 'En attente', value: formatCurrency(data.data.summary.pendingExpenses) },
              { label: t('reports.expenseCount'), value: String(data.data.summary.expenseCount) },
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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('expenses.category')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Nb</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.total')}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(data.data.byCategory)
                    .filter(([, v]: any) => v.count > 0)
                    .sort(([, a]: any, [, b]: any) => b.total - a.total)
                    .map(([cat, v]: any) => (
                      <tr key={cat} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground capitalize">{cat}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{v.count}</td>
                        <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(v.total)}</td>
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.date')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.description')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('expenses.category')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.amount')}</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('reports.approvedOne')}</th>
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
                    <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.amount)}</td>
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
              { label: t('reports.availableQty'), value: String(data.data.summary.availableEntries) },
              { label: t('reports.expiringSoon'), value: String(data.data.summary.expiringSoon) },
              { label: t('reports.lowStock'), value: String(data.data.summary.lowStockItems) },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-lg font-bold text-foreground">{s.value}</p></CardContent></Card>
            ))}
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('reports.material')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Disponible</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('stock.reserved')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valeur</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('reports.lowStockQ')}</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.data.details?.map((r: any) => (
                  <tr key={r.rawMaterialId} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name} <span className="text-xs text-muted-foreground">({r.unit})</span></td>
                    <td className="px-4 py-3 text-right text-foreground whitespace-nowrap tabular-nums">{r.availableQuantity}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{r.reservedQuantity}</td>
                    <td className="px-4 py-3 text-right text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.stockValue)}</td>
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
              { label: t('reports.totalHt'), value: formatCurrency(data.data.totals.totalHT) },
              { label: t('reports.totalVat'), value: formatCurrency(data.data.totals.totalTax) },
              { label: t('reports.totalTtc'), value: formatCurrency(data.data.totals.totalTTC) },
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
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{r.taxRate}%</td>
                    <td className="px-4 py-3 text-right text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.htBase)}</td>
                    <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.taxCollected)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap tabular-nums">{r.invoiceCount}</td>
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
                      <td className="px-4 py-3 text-right text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.htBase)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.taxCollected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {tab === 'agedBalance' && data?.data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {data.data.tranches.map((tr: any) => (
              <Card key={tr.cle}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{tr.libelle}</p>
                  {/* Le rouge est réservé aux tranches en retard : « non échu »
                      n'est pas une mauvaise nouvelle. */}
                  <p className={`text-lg font-bold ${tr.cle === 'j90plus' && data.data.totaux[tr.cle] > 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {formatCurrency(data.data.totaux[tr.cle] ?? 0)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('customers.title')}</th>
                  {data.data.tranches.map((tr: any) => (
                    <th key={tr.cle} className="px-3 py-2 text-right font-medium text-muted-foreground">{tr.libelle}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('common.total')}</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('reports.oldest')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.data.clients.map((c: any) => (
                  <tr key={c.customerId} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-foreground">{c.customerName}</td>
                    {data.data.tranches.map((tr: any) => (
                      <td key={tr.cle} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {c[tr.cle] ? formatCurrency(c[tr.cle]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground whitespace-nowrap tabular-nums">
                      {formatCurrency(c.total)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${c.plusAncien > 90 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {c.plusAncien > 0 ? `${c.plusAncien} j` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50">
                <tr>
                  <td className="px-3 py-2 font-semibold text-foreground">{t('common.total')}</td>
                  {data.data.tranches.map((tr: any) => (
                    <td key={tr.cle} className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatCurrency(data.data.totaux[tr.cle] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap tabular-nums">{formatCurrency(data.data.totalGeneral)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t('reports.agedBalanceNote')}</p>
        </div>
      )}

      {tab === 'tax' && data?.data?.g50 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t('reports.g50')}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('reports.vatCollected')}</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(data.data.g50.tvaCollectee)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('reports.vatDeductible')}</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(data.data.g50.tvaDeductible)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              {/* Un solde négatif est un crédit reportable, pas un dû : les deux
                  cases sont distinctes pour qu'on ne lise pas l'un pour l'autre. */}
              <p className="text-xs text-muted-foreground">
                {data.data.g50.creditReportable > 0 ? t('reports.vatCredit') : t('reports.vatDue')}
              </p>
              <p className="text-lg font-bold text-foreground">
                {formatCurrency(data.data.g50.creditReportable > 0
                  ? data.data.g50.creditReportable
                  : data.data.g50.soldeAPayer)}
              </p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t('reports.stampCollected')}</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(data.data.g50.timbreEncaisse)}</p>
            </CardContent></Card>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{t('reports.totalToRemit')}</span>
              <span className="text-lg font-bold text-foreground">{formatCurrency(data.data.g50.totalAReverser)}</span>
            </div>
          </div>

          {data.data.deductibleByRate?.length > 0 && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('settings.taxRate')}</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('reports.htBase')}</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('reports.vatDeductible')}</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('reports.billCount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.data.deductibleByRate.map((r: any) => (
                    <tr key={r.taxRate}>
                      <td className="px-3 py-2 text-foreground">{r.taxRate} %</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap tabular-nums">{formatCurrency(r.htBase)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap tabular-nums">{formatCurrency(r.taxDeductible)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap tabular-nums">{r.billCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('reports.g50Note')}</p>
        </div>
      )}

    </div>
  );
}
