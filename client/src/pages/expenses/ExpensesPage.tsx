import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { expensesApi , resolveApiError } from '@/lib/api';
import { formatCurrency, formatDate, currentMonth } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, CheckCircle, Trash2 } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';

const CATEGORIES = ['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other'];

/**
 * L'écran filtre sur un mois, l'export sur une période : sans cette
 * conversion, le fichier contiendrait tout l'historique alors que la liste
 * n'affiche qu'un mois.
 *
 * Le jour 0 du mois suivant est le dernier jour du mois courant — la seule
 * formule qui n'ait pas besoin de connaître les mois de 30 jours ni février.
 */
function bornesDuMois(mois: string) {
  const [annee, m] = mois.split('-').map(Number);
  const dernier = new Date(annee, m, 0).getDate();
  return { dateFrom: `${mois}-01`, dateTo: `${mois}-${String(dernier).padStart(2, '0')}` };
}

const schema = z.object({
  expenseDate: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['loyer', 'utilities', 'transport', 'rh', 'maintenance', 'other']),
  amount: z.coerce.number().positive(),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function ExpensesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [month, setMonth] = useState(currentMonth());
  // L'union couvre toutes les colonnes du menu : « notes » est masquée par
  // défaut mais reste activable.
  const { visible, toggle, col } = useColumnVisibility<
    'date' | 'description' | 'category' | 'amount' | 'status' | 'notes'
  >(
    'expenses_visible_columns',
    ['date', 'description', 'category', 'amount', 'status'],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', page, category],
    queryFn: () => expensesApi.list({ page, limit: 20, category: category || undefined }),
  });

  // Le résumé porte sur un mois, indépendamment du filtre de catégorie et de
  // la pagination de la liste.
  const { data: summaryData } = useQuery({
    queryKey: ['expenses-summary', month],
    queryFn: () => expensesApi.summary(month),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'other' },
  });

  const mutation = useMutation({
    mutationFn: (d: FormData) => editing ? expensesApi.update(editing.id, d) : expensesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenses-summary'] }); toast(t('common.save') + ' !'); closeModal(); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => expensesApi.approve(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenses-summary'] }); toast(t('common.approve') + ' !'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => expensesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['expenses-summary'] }); toast(t('common.delete') + ' !', 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() { setEditing(null); reset({ category: 'other' }); setModalOpen(true); }
  function openEdit(e: any) {
    setEditing(e);
    reset({ ...e, expenseDate: e.expenseDate?.slice(0, 10), amount: parseFloat(e.amount) });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('expenses.title')}</h1>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> {t('expenses.new')}</Button>
      </div>

      {summaryData?.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: t('expenses.summary.total'), value: formatCurrency(summaryData.data.totalExpenses) },
            { label: t('expenses.summary.approved'), value: formatCurrency(summaryData.data.totalApproved) },
            { label: t('expenses.summary.pending'), value: formatCurrency(summaryData.data.totalPending) },
            { label: t('expenses.summary.perDay'), value: formatCurrency(summaryData.data.average.perDay) },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-bold text-foreground">{s.value}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="w-44">
          <option value="">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{t(`expenses.categories.${c}`)}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <ExportButton
            dataset="depenses"
            filtres={{ ...bornesDuMois(month), category }}
          />
          <ColumnToggleMenu
            columns={[
              { key: 'date', label: t('expenses.date') },
              { key: 'description', label: t('expenses.description') },
              { key: 'category', label: t('expenses.category') },
              { key: 'amount', label: t('expenses.amount') },
              { key: 'status', label: t('common.status') },
              { key: 'notes', label: 'Notes' },
            ]}
            visible={visible}
            onToggle={toggle}
          />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {col('date') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('expenses.date')}</th>}
                {col('description') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('expenses.description')}</th>}
                {col('category') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('expenses.category')}</th>}
                {col('amount') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('expenses.amount')}</th>}
                {col('status') && <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>}
                {col('notes') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((e: any) => (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                  {col('date') && <td className="px-4 py-3 text-muted-foreground">{formatDate(e.expenseDate)}</td>}
                  {col('description') && (
                    <td className="px-4 py-3">
                      <Link to={`/expenses/${e.id}`} className="text-primary hover:underline">{e.description}</Link>
                    </td>
                  )}
                  {col('category') && <td className="px-4 py-3"><Badge variant="secondary">{t(`expenses.categories.${e.category}`)}</Badge></td>}
                  {col('amount') && <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(e.amount)}</td>}
                  {col('status') && <td className="px-4 py-3 text-center">
                    <Badge variant={e.isApproved ? 'success' : 'warning'}>
                      {e.isApproved ? t('expenses.approved') : t('expenses.pending')}
                    </Badge>
                  </td>}
                  {col('notes') && <td className="px-4 py-3 text-muted-foreground text-xs">{e.notes || '—'}</td>}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {!e.isApproved && (
                        <>
                          <Button variant="ghost" size="icon" title={t('common.approve')} onClick={() => approveMutation.mutate(e.id)}>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                            <span className="text-xs">{t('common.edit')}</span>
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(e.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('expenses.new')}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('expenses.date')} *</label>
              <Input type="date" {...register('expenseDate')} />
              {errors.expenseDate && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('expenses.amount')} *</label>
              <Input type="number" step="0.01" {...register('amount')} />
              {errors.amount && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('expenses.description')} *</label>
            <Input {...register('description')} />
            {errors.description && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('expenses.category')}</label>
            <Select {...register('category')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{t(`expenses.categories.${c}`)}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Input {...register('notes')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
