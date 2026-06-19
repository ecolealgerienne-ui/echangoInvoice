import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { deliveriesApi, customersApi, productsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Search } from 'lucide-react';

const STATUS_VARIANT: Record<string, any> = {
  draft: 'muted', delivered: 'success', cancelled: 'secondary',
};

const itemSchema = z.object({
  finishedProductId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
});

const schema = z.object({
  customerId: z.string().uuid(),
  deliveryDate: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

type FormData = z.infer<typeof schema>;

export function DeliveryNotesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-notes', page, search],
    queryFn: () => deliveriesApi.list({ page, limit: 20, search: search || undefined }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 20, search: undefined }),
  });

  const { data: productsForBL } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDate: new Date().toISOString().split('T')[0],
      items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => deliveriesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      toast(t('deliveries.created'), 'success');
      closeModal();
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => deliveriesApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      toast(t('deliveries.cancelled'), 'success');
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  function closeModal() {
    setModalOpen(false);
    reset({
      deliveryDate: new Date().toISOString().split('T')[0],
      items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0 }],
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('deliveries.title')}</h1>
        <Button onClick={() => setModalOpen(true)} size="sm">
          <Plus className="h-4 w-4" /> {t('deliveries.new')}
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('deliveries.blNumber')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.customer')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.date')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((bl: any) => (
                <tr key={bl.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-foreground">{bl.blNumber}</td>
                  <td className="px-4 py-3 text-foreground">{bl.customer?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(bl.deliveryDate)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[bl.status] ?? 'muted'}>{t(`deliveries.status.${bl.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {bl.status === 'draft' && (
                      <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(bl.id)}>
                        {t('common.cancel')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && (
        <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />
      )}

      <Modal open={modalOpen} onClose={closeModal} title={t('deliveries.new')}>
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('common.customer')} *</label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register('customerId')}>
                <option value="">{t('common.select')}</option>
                {customers?.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.customerId && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('common.date')} *</label>
              <Input type="date" {...register('deliveryDate')} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0 })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-[1fr_70px_70px_70px_32px] gap-2 items-end">
                <div>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...register(`items.${i}.finishedProductId`)}>
                    <option value="">{t('common.select')}</option>
                    {productsForBL?.data?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <Input type="number" step="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} />
                <Input placeholder={t('common.unit')} {...register(`items.${i}.unit`)} />
                <Input type="number" step="0.01" placeholder={t('common.price')} {...register(`items.${i}.unitPrice`)} />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('common.notes')}</label>
            <Input {...register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
