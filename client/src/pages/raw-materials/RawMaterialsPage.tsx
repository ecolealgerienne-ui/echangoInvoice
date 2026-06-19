import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { rawMaterialsApi } from '@/lib/api';
import { useUnits } from '@/lib/useUnits';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const schema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export function RawMaterialsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const units = useUnits();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['raw-materials', page, search],
    queryFn: () => rawMaterialsApi.list({ page, limit: 20, search: search || undefined }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (d: FormData) => editing ? rawMaterialsApi.update(editing.id, d) : rawMaterialsApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['raw-materials'] }); toast(t('common.save') + ' !'); closeModal(); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rawMaterialsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['raw-materials'] }); toast(t('common.delete') + ' !', 'success'); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  function openCreate() { setEditing(null); reset({}); setModalOpen(true); }
  function openEdit(m: any) { setEditing(m); reset(m); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('rawMaterials.title')}</h1>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> {t('rawMaterials.new')}</Button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t('common.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('rawMaterials.name')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('rawMaterials.unit')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('rawMaterials.description')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((m: any) => (
                <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{m.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.unit}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.description || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('rawMaterials.new')}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('rawMaterials.name')} *</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('rawMaterials.unit')} *</label>
            <Select {...register('unit')} className="w-full">
              <option value="">{t('common.select')}</option>
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
            {errors.unit && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('rawMaterials.description')}</label>
            <Input {...register('description')} />
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
