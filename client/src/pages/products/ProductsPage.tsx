import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { productsApi, suppliersApi, settingsApi , resolveApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useUnits } from '@/lib/useUnits';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';

const schema = z.object({
  type: z.enum(['product', 'material', 'both']).default('product'),
  name: z.string().min(1),
  code: z.string().optional(),
  unit: z.string().min(1),
  defaultSalesPrice: z.coerce.number().min(0).optional(),
  lastCostPerUnit: z.coerce.number().min(0).optional(),
  alertThreshold: z.coerce.number().min(0).optional(),
  supplierId: z.string().optional(),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const TYPE_FILTERS = ['all', 'product', 'material', 'both'] as const;

const ALL_COLUMNS = ['type', 'name', 'code', 'unit', 'salesPrice', 'costPrice', 'supplier', 'description'] as const;
type ColumnKey = typeof ALL_COLUMNS[number];

export function ProductsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const units = useUnits();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'product' | 'material' | 'both'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { visible: visibleColumns, toggle: toggleColumn, col } = useColumnVisibility<ColumnKey>(
    'products_visible_columns',
    ['type', 'name', 'code', 'unit', 'salesPrice', 'costPrice'],
  );

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const defaultUnit: string = settingsData?.data?.defaultUnit ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search, typeFilter],
    queryFn: () => productsApi.list({
      page, limit: 20,
      search: search || undefined,
      type: typeFilter === 'all' ? undefined : typeFilter,
    }),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => suppliersApi.list({ page: 1, limit: 100 }),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'product', unit: defaultUnit },
  });

  // Sync default unit once settings load (create modal only)
  useEffect(() => {
    if (!editing && defaultUnit) {
      reset((prev) => ({ ...prev, unit: prev.unit || defaultUnit }));
    }
  }, [defaultUnit, editing, reset]);

  const mutation = useMutation({
    mutationFn: (d: FormData) =>
      editing ? productsApi.update(editing.id, d) : productsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(t('common.save') + ' !', 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(t('common.deleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() {
    setEditing(null);
    reset({ type: 'product', unit: defaultUnit });
    setModalOpen(true);
  }
  function openEdit(p: any) { setEditing(p); reset(p); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); reset({ type: 'product', unit: defaultUnit }); }

  const suppliers = suppliersData?.data ?? [];

  const COLUMN_LABELS: Record<ColumnKey, string> = {
    type: t('products.type.label'),
    name: t('products.name'),
    code: t('products.code'),
    unit: t('products.unit'),
    salesPrice: t('products.price'),
    costPrice: t('products.costPerUnit'),
    supplier: t('products.supplier'),
    description: t('products.description'),
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('products.title')}</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('products.new')}
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden text-sm">
          {TYPE_FILTERS.map(f => (
            <button key={f}
              onClick={() => { setTypeFilter(f); setPage(1); }}
              className={`px-3 py-1.5 transition-colors ${typeFilter === f ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
              {t(`products.type.${f}`)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* « all » et « both » n'ont pas d'équivalent dans la colonne `type` :
              on n'envoie le filtre que lorsqu'il désigne une valeur réelle. */}
          <ExportButton
            dataset="articles"
            filtres={{ type: typeFilter === 'product' || typeFilter === 'material' ? typeFilter : undefined }}
          />
          <ColumnToggleMenu
            columns={ALL_COLUMNS.map(k => ({ key: k, label: COLUMN_LABELS[k] }))}
            visible={visibleColumns}
            onToggle={key => toggleColumn(key as ColumnKey)}
          />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {col('type') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.type.label')}</th>}
                {col('name') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.name')}</th>}
                {col('code') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.code')}</th>}
                {col('unit') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.unit')}</th>}
                {col('salesPrice') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('products.price')}</th>}
                {col('costPrice') && <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('products.costPerUnit')}</th>}
                {col('supplier') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.supplier')}</th>}
                {col('description') && <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.description')}</th>}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visibleColumns.length + 1} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((p: any) => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  {col('type') && (
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.type === 'material' ? 'bg-orange-100 text-orange-700' :
                        p.type === 'both' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{t(`products.type.${p.type}`)}</span>
                    </td>
                  )}
                  {col('name') && (
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/products/${p.id}`} className="text-primary hover:underline">{p.name}</Link>
                    </td>
                  )}
                  {col('code') && <td className="px-4 py-3 font-mono text-muted-foreground">{p.code || '—'}</td>}
                  {col('unit') && <td className="px-4 py-3 text-muted-foreground">{p.unit}</td>}
                  {col('salesPrice') && (
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.defaultSalesPrice != null ? formatCurrency(p.defaultSalesPrice) : '—'}
                    </td>
                  )}
                  {col('costPrice') && (
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {p.lastCostPerUnit != null ? formatCurrency(p.lastCostPerUnit) : '—'}
                    </td>
                  )}
                  {col('supplier') && (
                    <td className="px-4 py-3 text-muted-foreground">{p.supplierName || '—'}</td>
                  )}
                  {col('description') && (
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{p.description || '—'}</td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('products.new')}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('products.type.label')} *</label>
            <select {...register('type')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="product">{t('products.type.product')}</option>
              <option value="material">{t('products.type.material')}</option>
              <option value="both">{t('products.type.both')}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium text-foreground">{t('products.name')} *</label>
              <Input {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('products.code')}</label>
              <Input {...register('code')} placeholder="REF-001" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('products.unit')} *</label>
              <Select {...register('unit')} className="w-full">
                <option value="">{t('common.select')}</option>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
              {errors.unit && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('products.price')}</label>
              <Input type="number" step="0.01" {...register('defaultSalesPrice')} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('products.costPerUnit')}</label>
              <Input type="number" step="0.01" {...register('lastCostPerUnit')} placeholder="0.00" />
            </div>
          </div>

          {suppliers.length > 0 && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('nav.suppliers')}</label>
              <select {...register('supplierId')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">{t('common.select')}</option>
                {suppliers.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('stock.thresholdLabel')}</label>
            <Input type="number" step="0.01" min="0" {...register('alertThreshold')} placeholder="0" />
            <p className="text-xs text-muted-foreground">{t('stock.thresholdHint')}</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('common.description')}</label>
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
