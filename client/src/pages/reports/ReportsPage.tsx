import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type ReportType = 'sales' | 'purchases' | 'expenses' | 'stock';

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
      return reportsApi[tab]({ dateFrom, dateTo, page, limit: 20 });
    },
    enabled: ready || tab === 'stock',
  });

  const tabs: ReportType[] = ['sales', 'purchases', 'expenses', 'stock'];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground">{t('reports.title')}</h1>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
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
    </div>
  );
}
