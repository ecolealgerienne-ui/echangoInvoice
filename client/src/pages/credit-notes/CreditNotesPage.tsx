import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { creditNotesApi, customersApi, invoicesApi , resolveApiError } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
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
import { EtatVide } from '@/components/shared/EtatVide';
import { EnTetePage } from '@/components/shared/EnTetePage';
import { MenuActions } from '@/components/shared/MenuActions';
import { TableConteneur } from '@/components/ui/DataTable';


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
    <div className="space-y-4">
      <EnTetePage titre={t('creditNotes.title')} total={pagination?.total} cleTotal="creditNotes.totalCount">
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />{t('creditNotes.new')}
        </Button>
      </EnTetePage>

      <div className="flex justify-end items-center gap-2">
        <ExportButton dataset="avoirs" />
        <ColumnToggleMenu
          columns={[
            { key: 'number', label: t('creditNotes.creditNoteNumber') },
            { key: 'customer', label: t('customers.title') },
            { key: 'date', label: 'Date' },
            { key: 'reason', label: t('creditNotes.reason') },
            { key: 'total', label: t('common.totalTtc') },
            { key: 'status', label: t('quotes.status') },
            { key: 'notes', label: t('common.notes') },
          ]}
          visible={visible}
          onToggle={toggle}
        />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <TableConteneur>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {col('number') && <th className="text-left px-3 py-2.5">{t('creditNotes.creditNoteNumber')}</th>}
                {col('customer') && <th className="text-left px-3 py-2.5">{t('customers.title')}</th>}
                {col('date') && <th className="text-left px-3 py-2.5">{t('common.date')}</th>}
                {col('reason') && <th className="text-left px-3 py-2.5">{t('creditNotes.reason')}</th>}
                {col('total') && <th className="text-right px-3 py-2.5">{t('common.totalTtc')}</th>}
                {col('status') && <th className="text-left px-3 py-2.5">{t('quotes.status')}</th>}
                {col('notes') && <th className="text-left px-3 py-2.5">{t('common.notes')}</th>}
                <th className="px-3 py-2.5 text-2xs uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {creditNotes.map((cn: any) => (
                <tr key={cn.id} className="border-t border-border hover:bg-surface-hover">
                  {col('number') && (
                    <td className="px-3 py-2.5 font-medium">
                      <Link to={`/credit-notes/${cn.id}`} className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline">{cn.creditNoteNumber}</Link>
                    </td>
                  )}
                  {col('customer') && <td className="px-3 py-2.5">{cn.customer?.name ?? '—'}</td>}
                  {col('date') && <td className="px-3 py-2.5">{formatDate(cn.creditNoteDate)}</td>}
                  {col('reason') && <td className="px-3 py-2.5 text-muted-foreground text-xs">{cn.reason ?? '—'}</td>}
                  {col('total') && <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{formatCurrency(cn.totalAmount)}</td>}
                  {col('status') && <td className="px-3 py-2.5"><Badge variant={varianteStatut(cn.status)}>{t(`status.${cn.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-3 py-2.5 text-muted-foreground text-xs">{cn.notes ?? '—'}</td>}
                  {/* Les trois actions du bas n'avaient même pas d'infobulle :
                      une coche verte, une croix rouge et une corbeille, à
                      deviner. Elles portent désormais leur nom. */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button size="sm" variant="ghost" title={t('common.pdf')}
                        onClick={() => telechargerPdf(cn.id, cn.creditNoteNumber)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                      <MenuActions
                        actions={[
                          cn.status === 'draft' && {
                            cle: 'issue', libelle: t('creditNotes.issue'), icone: CheckCircle,
                            onSelect: () => issueMutation.mutate(cn.id),
                          },
                          cn.status === 'issued' && {
                            cle: 'cancel', libelle: t('creditNotes.cancel'), icone: XCircle, danger: true,
                            onSelect: () => cancelMutation.mutate(cn.id),
                          },
                          cn.status === 'draft' && {
                            cle: 'delete', libelle: t('common.delete'), icone: Trash2, danger: true,
                            onSelect: () => removeMutation.mutate(cn.id),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {creditNotes.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="px-4 py-2 text-center text-muted-foreground"><EtatVide /></td></tr>
              )}
            </tbody>
          </table>
        </TableConteneur>
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
              <label className="text-sm font-medium">{t('creditNotes.linkedInvoice')}</label>
              <Select {...register('salesInvoiceId')} className="mt-1 w-full">
                <option value="">{t('common.none')}</option>
                {invoiceList.map((inv: any) => (
                  <option key={inv.id} value={inv.id}>{inv.invoiceNumber}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('creditNotes.date')}</label>
              <Input type="date" {...register('creditNoteDate')} className="mt-1" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('creditNotes.reason')}</label>
              <Input {...register('reason')} className="mt-1" placeholder={t('creditNotes.reasonPlaceholder')} />
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
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
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
