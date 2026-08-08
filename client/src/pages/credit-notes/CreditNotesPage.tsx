import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { creditNotesApi, customersApi, invoicesApi , resolveApiError } from '@/lib/api';
import { enregistrerBlob } from '@/lib/download';
import { useUnits } from '@/lib/useUnits';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, CheckCircle, XCircle, FileDown } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', issued: 'success', applied: 'info', cancelled: 'destructive',
};

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().optional(),
  unitPrice: z.coerce.number().min(0),
  taxRate1: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  customerId: z.string().uuid(),
  salesInvoiceId: z.string().uuid().optional().or(z.literal('')),
  creditNoteDate: z.string().min(1),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

type FormData = z.infer<typeof schema>;

const today = new Date().toISOString().split('T')[0];

export function CreditNotesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const units = useUnits();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['credit-notes', page],
    queryFn: () => creditNotesApi.list({ page, limit: 20 }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 20, search: undefined }),
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-select'],
    queryFn: () => invoicesApi.list({ limit: 200 }),
    enabled: modalOpen,
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      creditNoteDate: today,
      items: [{ description: '', quantity: 1, unit: '', unitPrice: 0, taxRate1: 19 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => {
      const payload = { ...d, salesInvoiceId: d.salesInvoiceId || undefined };
      return creditNotesApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      toast(t('creditNotes.created'), 'success');
      setModalOpen(false); reset();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const issueMutation = useMutation({
    mutationFn: (id: string) => creditNotesApi.issue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      toast(t('creditNotes.issued'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => creditNotesApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      toast(t('creditNotes.cancelled'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => creditNotesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      toast(t('creditNotes.deleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const creditNotes = data?.data ?? [];
  const pagination = data?.pagination;
  // L'union couvre toutes les colonnes du menu, pas seulement celles visibles
  // par défaut : « notes » est masquée au départ mais reste activable.
  const { visible, toggle, col } = useColumnVisibility<
    'number' | 'customer' | 'date' | 'reason' | 'total' | 'status' | 'notes'
  >(
    'creditnotes_visible_columns',
    ['number', 'customer', 'date', 'reason', 'total', 'status'],
  );
  const customerList = customers?.data ?? [];

  function telechargerPdf(id: string, numero: string) {
    creditNotesApi.pdf(id)
      .then((blob: Blob) => enregistrerBlob(blob, `${numero}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }
  const invoiceList = invoicesData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('creditNotes.title')}</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />{t('creditNotes.new')}
        </Button>
      </div>

      <div className="flex justify-end items-center gap-2">
        <ExportButton dataset="avoirs" />
        <ColumnToggleMenu
          columns={[
            { key: 'number', label: t('creditNotes.creditNoteNumber') },
            { key: 'customer', label: t('customers.title') },
            { key: 'date', label: 'Date' },
            { key: 'reason', label: t('creditNotes.reason') },
            { key: 'total', label: 'Total TTC' },
            { key: 'status', label: t('quotes.status') },
            { key: 'notes', label: 'Notes' },
          ]}
          visible={visible}
          onToggle={toggle}
        />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {col('number') && <th className="text-left px-4 py-3 font-medium">{t('creditNotes.creditNoteNumber')}</th>}
                {col('customer') && <th className="text-left px-4 py-3 font-medium">{t('customers.title')}</th>}
                {col('date') && <th className="text-left px-4 py-3 font-medium">Date</th>}
                {col('reason') && <th className="text-left px-4 py-3 font-medium">{t('creditNotes.reason')}</th>}
                {col('total') && <th className="text-right px-4 py-3 font-medium">Total TTC</th>}
                {col('status') && <th className="text-left px-4 py-3 font-medium">{t('quotes.status')}</th>}
                {col('notes') && <th className="text-left px-4 py-3 font-medium">Notes</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((cn: any) => (
                <tr key={cn.id} className="border-t border-border hover:bg-muted/30">
                  {col('number') && <td className="px-4 py-3 font-mono text-xs">{cn.creditNoteNumber}</td>}
                  {col('customer') && <td className="px-4 py-3">{cn.customer?.name ?? '—'}</td>}
                  {col('date') && <td className="px-4 py-3">{formatDate(cn.creditNoteDate)}</td>}
                  {col('reason') && <td className="px-4 py-3 text-muted-foreground text-xs">{cn.reason ?? '—'}</td>}
                  {col('total') && <td className="px-4 py-3 text-right font-medium">{formatCurrency(cn.totalAmount)}</td>}
                  {col('status') && <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[cn.status] ?? 'muted'}>{t(`status.${cn.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-4 py-3 text-muted-foreground text-xs">{cn.notes ?? '—'}</td>}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="ghost" title={t('common.pdf')}
                        onClick={() => telechargerPdf(cn.id, cn.creditNoteNumber)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                      {cn.status === 'draft' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => issueMutation.mutate(cn.id)}>
                            <CheckCircle className="h-4 w-4 text-success" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeMutation.mutate(cn.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      {cn.status === 'issued' && (
                        <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(cn.id)}>
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {creditNotes.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="px-4 py-8 text-center text-muted-foreground">{t('common.noData')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (
        <Pagination page={page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); reset(); }} title={t('creditNotes.new')}>
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('customers.title')}</label>
              <Select {...register('customerId')} className="mt-1 w-full">
                <option value="">{t('common.select')}</option>
                {customerList.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {errors.customerId && <p className="text-xs text-destructive mt-1">{t('errors.required')}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Facture liée (optionnel)</label>
              <Select {...register('salesInvoiceId')} className="mt-1 w-full">
                <option value="">— Aucune —</option>
                {invoiceList.map((inv: any) => (
                  <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date de l'avoir</label>
              <Input type="date" {...register('creditNoteDate')} className="mt-1" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('creditNotes.reason')}</label>
              <Input {...register('reason')} className="mt-1" placeholder="Motif de l'avoir..." />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => append({ description: '', quantity: 1, unit: '', unitPrice: 0, taxRate1: 19 })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Input placeholder="Description" {...register(`items.${i}.description`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Select {...register(`items.${i}.unit`)} className="text-xs">
                      <option value="">—</option>
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0" placeholder="P.U. HT" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" step="1" min="0" placeholder="TVA%" {...register(`items.${i}.taxRate1`)} className="text-xs" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {fields.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => { setModalOpen(false); reset(); }}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
