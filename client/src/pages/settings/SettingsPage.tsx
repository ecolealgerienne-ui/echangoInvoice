import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { settingsApi , resolveApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Plus, X, Trash2, Upload } from 'lucide-react';
import { rules } from '@/lib/validation';

type SettingsTab = 'general' | 'tax' | 'units' | 'formats';

interface TaxRow { name: string; rate: string; isDefault: boolean; }

const DEFAULT_UNITS = ['kg', 'g', 'tonne', 'L', 'mL', 'pcs', 'm', 'm²', 'm³', 'boîte', 'palette', 'sac'];

export function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('general');

  // Logo state
  const [logo, setLogo] = useState<string | null>(null);

  // Units state
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [defaultUnit, setDefaultUnit] = useState<string>('');
  const [newUnit, setNewUnit] = useState('');

  // Tax rates state (fully local, replaces react-hook-form taxRates)
  const [taxRates, setTaxRates] = useState<TaxRow[]>([{ name: 'TVA', rate: '19', isDefault: true }]);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  useEffect(() => {
    if (!data?.data) return;
    const d = data.data;
    reset(d);

    const rawUnits: string[] = d.units ?? [];
    setUnits(rawUnits.length > 0 ? rawUnits : DEFAULT_UNITS);
    setDefaultUnit(d.defaultUnit ?? '');
    setLogo(d.logo ?? null);

    if (d.taxRates?.length > 0) {
      setTaxRates(d.taxRates.map((r: any) => ({
        name: r.name,
        rate: String(r.rate),
        isDefault: !!r.isDefault,
      })));
    }
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (formData: any) => {
      const { id, tenantId, logo: _logo, updatedBy, createdAt, updatedAt, taxRate: _tr, taxRates: _trc, units: _u, defaultUnit: _du, ...payload } = formData;
      return settingsApi.update({
        ...payload,
        logo: logo ?? undefined,
        units,
        defaultUnit: defaultUnit || undefined,
        taxRates: taxRates.map(r => ({
          name: r.name,
          rate: r.rate !== '' ? Number(r.rate) : 0,
          isDefault: r.isDefault,
        })),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast(t('settings.saved')); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  // ── Units helpers ────────────────────────────────────────────────────────
  function addUnit() {
    const v = newUnit.trim();
    if (!v || units.includes(v)) return;
    setUnits([...units, v]);
    setNewUnit('');
  }

  function removeUnit(u: string) {
    setUnits(units.filter(x => x !== u));
    if (defaultUnit === u) setDefaultUnit('');
  }

  // ── Tax helpers ──────────────────────────────────────────────────────────
  function addTaxRow() {
    setTaxRates([...taxRates, { name: '', rate: '0', isDefault: false }]);
  }

  function removeTaxRow(i: number) {
    const next = taxRates.filter((_, idx) => idx !== i);
    // If we removed the default, assign default to first row
    if (taxRates[i].isDefault && next.length > 0) next[0].isDefault = true;
    setTaxRates(next);
  }

  function updateTaxRow(i: number, field: keyof TaxRow, value: string | boolean) {
    setTaxRates(taxRates.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function setDefaultTax(i: number) {
    setTaxRates(taxRates.map((r, idx) => ({ ...r, isDefault: idx === i })));
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
                {/* Logo */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t('settings.logo')}</label>
                  <div className="flex items-start gap-4">
                    {logo ? (
                      <div className="relative border border-border rounded p-1 bg-muted flex items-center justify-center" style={{ minWidth: 120, minHeight: 60 }}>
                        <img src={logo} alt="logo" className="max-h-14 max-w-[120px] object-contain" />
                        <button type="button" onClick={() => setLogo(null)}
                          className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5 text-muted-foreground hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center border border-dashed border-border rounded p-4 cursor-pointer hover:bg-muted transition-colors text-muted-foreground text-xs gap-1" style={{ minWidth: 120, minHeight: 60 }}>
                        <Upload className="h-5 w-5" />
                        <span>{t('settings.uploadLogo')}</span>
                        <input type="file" accept="image/*" className="sr-only"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => setLogo(ev.target?.result as string);
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }} />
                      </label>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{t('settings.logoHint')}</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{t('settings.companyName')}</label>
                  <Input {...register('companyName', rules.maxLength(t('settings.companyName'), 255))} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{t('settings.currency')}</label>
                  <Input {...register('currency', rules.maxLength(t('settings.currency'), 10))} className="max-w-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">{t('settings.defaultPaymentTerms')}</label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <Input type="number" min="1" {...register('defaultPaymentTermsDays', rules.positiveInt(t('settings.defaultPaymentTerms')))} className="w-24" />
                    <span className="text-sm text-muted-foreground">{t('settings.days')}</span>
                  </div>
                  {errors.defaultPaymentTermsDays && <p className="text-xs text-destructive">{errors.defaultPaymentTermsDays.message as string}</p>}
                  <p className="text-xs text-muted-foreground">{t('settings.defaultPaymentTermsHint')}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t('settings.contact')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{t('settings.email')}</label>
                    <Input type="email" {...register('email', rules.optionalEmail())} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message as string}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">{t('settings.phone')}</label>
                    <Input {...register('phone', rules.optionalPhone())} />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone.message as string}</p>}
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
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.modules')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('settings.modulesDescription')}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-foreground">{t('settings.productionModule')}</label>
                    <p className="text-xs text-muted-foreground">{t('settings.productionModuleHint')}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary cursor-pointer"
                    {...register('productionModuleEnabled')}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── TVA ─────────────────────────────────────────────────────────── */}
        {tab === 'tax' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('settings.tabTax')}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{t('settings.taxRatesDescription')}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addTaxRow}>
                  <Plus className="h-4 w-4 mr-1" />{t('settings.addRate')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {taxRates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>
              )}
              <div className="space-y-2">
                {/* Header */}
                {taxRates.length > 0 && (
                  <div className="grid grid-cols-[1fr_100px_80px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>{t('settings.rateName')}</span>
                    <span>{t('settings.ratePercent')}</span>
                    <span className="text-center">{t('settings.default')}</span>
                    <span />
                  </div>
                )}
                {taxRates.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_80px_32px] gap-2 items-center">
                    <Input
                      value={row.name}
                      onChange={e => updateTaxRow(i, 'name', e.target.value)}
                      placeholder={t('settings.rateNamePlaceholder')}
                      className="text-sm"
                    />
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={row.rate}
                        onChange={e => updateTaxRow(i, 'rate', e.target.value)}
                        className="text-sm pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <div className="flex justify-center">
                      <input
                        type="radio"
                        name="defaultTax"
                        checked={row.isDefault}
                        onChange={() => setDefaultTax(i)}
                        className="h-4 w-4 accent-primary cursor-pointer"
                        title={t('settings.setAsDefault')}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTaxRow(i)}
                      disabled={taxRates.length === 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">{t('settings.taxRateHint')}</p>
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
            <CardContent className="space-y-5">
              {/* Default unit */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('settings.defaultUnit')}</label>
                <Select
                  value={defaultUnit}
                  onChange={e => setDefaultUnit(e.target.value)}
                  className="max-w-xs"
                >
                  <option value="">{t('settings.noDefault')}</option>
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.defaultUnitHint')}</p>
              </div>

              <hr className="border-border" />

              {/* Chips list */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">{t('settings.availableUnits')}</p>
                <div className="flex flex-wrap gap-2">
                  {units.map(u => (
                    <span key={u}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-medium transition-colors ${u === defaultUnit ? 'bg-primary/10 border-primary text-primary' : 'bg-muted border-border'}`}>
                      {u}
                      {u === defaultUnit && <span className="text-xs opacity-70">★</span>}
                      <button type="button" onClick={() => removeUnit(u)}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
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
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
