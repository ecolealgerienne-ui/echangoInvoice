import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { invoicesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Search, Send, XCircle } from 'lucide-react';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', sent: 'info', partial: 'warning', paid: 'success', overdue: 'destructive', cancelled: 'secondary',
};

export function InvoicesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, status],
    queryFn: () => invoicesApi.list({ page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.sent')); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.cancelled')); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('invoices.title')}</h1>
      </div>

      <div className="flex gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">Tous statuts</option>
          {['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'].map(s => (
            <option key={s} value={s}>{t(`invoices.status.${s}`)}</option>
          ))}
        </Select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.number')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.customer')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.invoiceDate')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('invoices.dueDate')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.amount')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('invoices.due')}</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-foreground">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-foreground">{inv.customer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatCurrency(inv.amountDue)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[inv.status]}>{t(`invoices.status.${inv.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {inv.status === 'draft' && (
                        <Button variant="ghost" size="icon" title="Envoyer" onClick={() => sendMutation.mutate(inv.id)}>
                          <Send className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {['draft', 'sent'].includes(inv.status) && (
                        <Button variant="ghost" size="icon" title="Annuler" onClick={() => cancelMutation.mutate(inv.id)}>
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}
    </div>
  );
}
