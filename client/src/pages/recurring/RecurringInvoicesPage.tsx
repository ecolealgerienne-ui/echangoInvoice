import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import {
  recurringApi, customersApi, productsApi, settingsApi, resolveApiError,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Play, Pause, Zap } from 'lucide-react';

const FREQUENCES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
const MODES = ['other', 'cash', 'bank_transfer', 'cheque'] as const;

const ligneSchema = z.object({
  finishedProductId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  taxRate1: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  label: z.string().min(1).max(120),
  customerId: z.string().uuid(),
  frequency: z.enum(FREQUENCES),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  paymentMode: z.enum(MODES),
  notes: z.string().optional(),
  items: z.array(ligneSchema).min(1),
});
type FormData = z.infer<typeof schema>;

const aujourdhui = new Date().toISOString().slice(0, 10);

export function RecurringInvoicesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringApi.lister(),
  });
  const abonnements = data?.data ?? [];

  const { data: clientsData } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 200 }),
  });
  const clients = clientsData?.data ?? [];

  const { data: produitsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productsApi.list({ limit: 200 }),
  });
  const produits = produitsData?.data ?? [];

  const { data: reglages } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const tauxDefaut = parseFloat(String(reglages?.data?.taxRate ?? 19));
  const delaiDefaut = reglages?.data?.defaultPaymentTermsDays ?? 30;

  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        frequency: 'monthly', startDate: aujourdhui, paymentMode: 'other',
        paymentTermsDays: 30,
        items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: tauxDefaut }],
      },
    });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const creation = useMutation({
    mutationFn: (d: FormData) => recurringApi.creer(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      toast(t('recurring.created'), 'success');
      fermer();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const bascule = useMutation({
    mutationFn: (id: string) => recurringApi.basculer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const generation = useMutation({
    mutationFn: (id: string) => recurringApi.generer(id),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      const n = r?.data?.generees?.length ?? 0;
      // Zéro n'est pas un échec : il n'y avait simplement rien d'échu. Le dire,
      // sinon l'utilisateur reclique en croyant que le bouton n'a pas marché.
      // « warning » et non « error » : rien d'échu n'est pas une panne, mais il
      // faut le distinguer d'une génération réussie, sinon on reclique.
      if (n) toast(t('recurring.generatedToast', { count: n }), 'success');
      else toast(t('recurring.nothingDue'), 'warning');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => recurringApi.supprimer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast(t('common.deleted'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function ouvrir() {
    reset({
      frequency: 'monthly', startDate: aujourdhui, paymentMode: 'other',
      paymentTermsDays: delaiDefaut,
      items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: tauxDefaut }],
    });
    setModalOpen(true);
  }
  function fermer() { setModalOpen(false); }

  /** Un abonnement dont l'échéance est passée attend une génération. */
  function enRetard(a: any): boolean {
    return a.isActive && String(a.nextRunDate).slice(0, 10) <= aujourdhui;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('recurring.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('recurring.subtitle')}</p>
        </div>
        <Button onClick={ouvrir} size="sm"><Plus className="h-4 w-4" /> {t('recurring.new')}</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('recurring.label')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('customers.title')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('recurring.frequency')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('recurring.nextRun')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('recurring.generated')}</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">{t('common.status')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {abonnements.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{t('recurring.empty')}</td></tr>
              )}
              {abonnements.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{a.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.customerName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t(`recurring.freq.${a.frequency}`)}</td>
                  <td className="px-4 py-3">
                    {/* Le retard est l'information qui appelle une action : il se
                        signale, le reste est de la consultation. */}
                    <span className={enRetard(a) ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      {formatDate(a.nextRunDate)}
                      {enRetard(a) ? ` — ${t('recurring.due')}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground whitespace-nowrap tabular-nums">{a.generatedCount}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={a.isActive ? 'success' : 'secondary'}>
                      {a.isActive ? t('recurring.active') : t('recurring.paused')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('recurring.generateNow')}
                        disabled={!a.isActive || generation.isPending}
                        onClick={() => generation.mutate(a.id)}>
                        <Zap className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        title={a.isActive ? t('recurring.pause') : t('recurring.resume')}
                        onClick={() => bascule.mutate(a.id)}>
                        {a.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => suppression.mutate(a.id)}>
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

      <p className="text-xs text-muted-foreground">
        {t('recurring.note')} <Link to="/invoices" className="text-primary hover:underline">{t('nav.invoices')}</Link>.
      </p>

      <Modal open={modalOpen} onClose={fermer} title={t('recurring.new')} size="xl">
        <form onSubmit={handleSubmit((d) => creation.mutate(d))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <label className="text-sm font-medium text-foreground">{t('recurring.label')} *</label>
              <Input {...register('label')} placeholder={t('recurring.labelPlaceholder')} />
              {errors.label && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('customers.title')} *</label>
              <Select {...register('customerId')}>
                <option value="">{t('common.select')}</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {errors.customerId && <p className="text-xs text-destructive">{t('errors.required')}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('recurring.frequency')} *</label>
              <Select {...register('frequency')}>
                {FREQUENCES.map((f) => <option key={f} value={f}>{t(`recurring.freq.${f}`)}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('recurring.startDate')} *</label>
              <Input type="date" {...register('startDate')} />
              <p className="text-xs text-muted-foreground">{t('recurring.startDateHint')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('recurring.endDate')}</label>
              <Input type="date" {...register('endDate')} />
              <p className="text-xs text-muted-foreground">{t('recurring.endDateHint')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('recurring.paymentTerms')}</label>
              <Input type="number" min="0" max="365" {...register('paymentTermsDays')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.paymentMode')}</label>
              <Select {...register('paymentMode')}>
                {MODES.map((m) => <option key={m} value={m}>{t(`invoices.methods.${m}`)}</option>)}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline"
                onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: tauxDefaut })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-[2fr_70px_60px_110px_80px_32px] gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">{t('common.product')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('common.qty')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('products.unit')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('purchases.unitPrice')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('settings.taxRate')}</span>
              <span />
            </div>
            {fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[2fr_70px_60px_110px_80px_32px] gap-2 items-center">
                <Select {...register(`items.${i}.finishedProductId`)}
                  onChange={(e) => {
                    setValue(`items.${i}.finishedProductId`, e.target.value);
                    const p = produits.find((x: any) => x.id === e.target.value);
                    if (p?.unit) setValue(`items.${i}.unit`, p.unit);
                    if (p?.defaultSalesPrice != null) setValue(`items.${i}.unitPrice`, Number(p.defaultSalesPrice));
                  }}>
                  <option value="">{t('common.select')}</option>
                  {produits.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input type="number" step="0.01" {...register(`items.${i}.quantity`)} className="text-xs" />
                <Input {...register(`items.${i}.unit`)} className="text-xs" />
                <Input type="number" step="0.01" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                <Input type="number" step="0.01" {...register(`items.${i}.taxRate1`)} className="text-xs" />
                <Button type="button" variant="ghost" size="icon"
                  disabled={fields.length === 1} onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {errors.items && <p className="text-xs text-destructive">{t('recurring.itemsRequired')}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('common.notes')}</label>
            <Input {...register('notes')} />
          </div>

          {/* Montant indicatif : les totaux réels sont calculés côté serveur à
              chaque échéance (R008), avec les taux en vigueur à ce moment-là. */}
          <p className="text-xs text-muted-foreground">
            {t('recurring.estimate')}{' '}
            <strong className="text-foreground">
              {formatCurrency((watch('items') ?? []).reduce(
                (s: number, l: any) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)
                  * (1 + (Number(l.taxRate1) || 0) / 100), 0))}
            </strong>
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={fermer}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={creation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
