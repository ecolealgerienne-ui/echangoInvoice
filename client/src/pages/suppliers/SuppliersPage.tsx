import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { suppliersApi , resolveApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  contactName: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function SuppliersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { visible, toggle, col } = useColumnVisibility(
    'suppliers_visible_columns',
    ['name', 'email', 'phone', 'address', 'contactName'],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => suppliersApi.list({ page, limit: 20, search: search || undefined }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (d: FormData) => editing ? suppliersApi.update(editing.id, d) : suppliersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast(t('common.save') + ' !'); closeModal(); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => suppliersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast(t('common.delete') + ' !', 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() { setEditing(null); reset({}); setModalOpen(true); }
  function openEdit(s: any) { setEditing(s); reset(s); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); reset({}); }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('suppliers.title')}</h1>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> {t('suppliers.new')}</Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <div className="ml-auto">
          <ColumnToggleMenu
            columns={[
              { key: 'name', label: t('suppliers.name') },
              { key: 'email', label: t('suppliers.email') },
              { key: 'phone', label: t('suppliers.phone') },
              { key: 'address', label: t('suppliers.address') },
              { key: 'contactName', label: t('suppliers.contactName') },
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
                {col('name') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('suppliers.name')}</th>}
                {col('email') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('suppliers.email')}</th>}
                {col('phone') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('suppliers.phone')}</th>}
                {col('address') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('suppliers.address')}</th>}
                {col('contactName') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('suppliers.contactName')}</th>}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  {col('name') && <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>}
                  {col('email') && <td className="px-4 py-3 text-muted-foreground">{s.email || '—'}</td>}
                  {col('phone') && <td className="px-4 py-3 text-muted-foreground">{s.phone || '—'}</td>}
                  {col('address') && <td className="px-4 py-3 text-muted-foreground">{s.address || '—'}</td>}
                  {col('contactName') && <td className="px-4 py-3 text-muted-foreground">{s.contactName || '—'}</td>}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('suppliers.new')}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('suppliers.name')} *</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('suppliers.email')}</label>
              <Input type="email" {...register('email')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('suppliers.phone')}</label>
              <Input {...register('phone')} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('suppliers.address')}</label>
            <Input {...register('address')} />
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
