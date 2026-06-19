import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Plus, X } from 'lucide-react';

type SettingsTab = 'general' | 'tax' | 'units' | 'formats';

export function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('general');

  // Units state (managed separately from react-hook-form)
  const [units, setUnits] = useState<string[]>([]);
  const [newUnit, setNewUnit] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const { register, handleSubmit, reset } = useForm<any>();

  useEffect(() => {
    if (data?.data) {
      reset(data.data);
      const raw: string[] = data.data.units ?? [];
      setUnits(raw.length > 0 ? raw : ['kg', 'g', 'tonne', 'L', 'mL', 'pcs', 'm', 'm²', 'm³', 'boîte', 'palette', 'sac']);
    }
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (d: any) => {
      const { id, tenantId, logo, updatedBy, createdAt, updatedAt, taxRates, units: _u, ...payload } = d;
      const cleanRates = (taxRates ?? []).map(({ id: _id, tenantId: _t, settingsId: _s, currency: _c, createdAt: _ca, updatedAt: _ua, rate, ...r }: any) => ({
        ...r, rate: rate !== '' && rate != null ? Number(rate) : undefined,
      }));
      return settingsApi.update({
        ...payload,
        taxRate: payload.taxRate !== '' && payload.taxRate != null ? Number(payload.taxRate) : undefined,
        taxRates: cleanRates,
        units,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast(t('settings.saved')); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  function addUnit() {
    const v = newUnit.trim();
    if (!v || units.includes(v)) return;
    setUnits([...units, v]);
    setNewUnit('');
  }

  function removeUnit(u: string) {
    setUnits(units.filter(x => x !== u));
  }

  if (isLoading) return <LoadingSpinner />;

  const TABS: { key: SettingsTab; label: string }[] = [
    { key: 'general', label: t('settings.tabGeneral') },
    { key: 'tax',     label: t('settings.tabTax') },
    { key: 'units',   label: t('settings.tabUnits') },
    { key: 'formats', label: t('settings.tabFormats') },
  ];

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t('settings.title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">

        {/* ── Général ─────────────────────────────────────────────────────── */}
        {tab === 'general' && (
          <>
            <Card>
              <CardHeader><CardTitle>{t('settings.company')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{t('settings.companyName')}</label>
                  <Input {...register('companyName')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{t('settings.taxRate')}</label>
                    <Input type="number" step="0.01" {...register('taxRate')} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{t('settings.currency')}</label>
                    <Input {...register('currency')} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('settings.contact')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{t('settings.email')}</label>
                    <Input type="email" {...register('email')} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{t('settings.phone')}</label>
                    <Input {...register('phone')} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{t('settings.address')}</label>
                  <Input {...register('address')} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{t('settings.footerText')}</label>
                  <Input {...register('footerText')} />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── TVA ─────────────────────────────────────────────────────────── */}
        {tab === 'tax' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.tabTax')}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{t('settings.taxRatesDescription')}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('settings.taxRate')} (%)</label>
                <Input type="number" step="0.01" {...register('taxRate')} className="max-w-xs" />
                <p className="text-xs text-muted-foreground">{t('settings.taxRateHint')}</p>
              </div>
              <div className="pt-2">
                <p className="text-sm font-medium text-foreground mb-2">{t('settings.additionalRates')}</p>
                {(data?.data?.taxRates ?? []).map((_: any, i: number) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-2 items-center">
                    <Input placeholder={t('settings.rateName')} {...register(`taxRates.${i}.name`)} className="text-sm" />
                    <Input type="number" step="0.01" placeholder="%" {...register(`taxRates.${i}.rate`)} className="text-sm" />
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" {...register(`taxRates.${i}.isDefault`)} />
                      {t('settings.default')}
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Unités ──────────────────────────────────────────────────────── */}
        {tab === 'units' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.tabUnits')}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{t('settings.unitsDescription')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Chips */}
              <div className="flex flex-wrap gap-2">
                {units.map(u => (
                  <span key={u}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-muted border border-border text-sm font-medium">
                    {u}
                    <button type="button" onClick={() => removeUnit(u)}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Add new unit */}
              <div className="flex gap-2 max-w-xs">
                <Input
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUnit(); } }}
                  placeholder={t('settings.newUnit')}
                  className="text-sm"
                />
                <Button type="button" variant="outline" onClick={addUnit}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">{t('settings.unitsHint')}</p>
            </CardContent>
          </Card>
        )}

        {/* ── Formats de numérotation ──────────────────────────────────────── */}
        {tab === 'formats' && (
          <Card>
            <CardHeader><CardTitle>{t('settings.numberFormats')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                ['blNumberFormat', t('settings.blFormat')],
                ['invoiceNumberFormat', t('settings.invoiceFormat')],
                ['quoteNumberFormat', t('settings.quoteFormat')],
                ['poNumberFormat', t('settings.poFormat')],
              ].map(([field, label]) => (
                <div key={field} className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <Input {...register(field)} />
                </div>
              ))}
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">{t('settings.formatsHint')}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>{t('common.save')}</Button>
        </div>
      </form>
    </div>
  );
}
