import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const { register, handleSubmit, reset } = useForm<any>();

  useEffect(() => {
    if (data?.data) reset(data.data);
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (d: any) => {
      const { id, tenantId, logo, updatedBy, createdAt, updatedAt, taxRates, ...payload } = d;
      const cleanRates = (taxRates ?? []).map(({ id: _id, tenantId: _t, settingsId: _s, currency: _c, createdAt: _ca, updatedAt: _ua, ...r }: any) => r);
      return settingsApi.update({ ...payload, taxRates: cleanRates });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast(t('settings.saved')); },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-bold text-foreground">{t('settings.title')}</h1>

      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">
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
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending}>{t('common.save')}</Button>
        </div>
      </form>
    </div>
  );
}
