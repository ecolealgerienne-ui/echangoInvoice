import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { CadreAuth } from '@/components/layout/CadreAuth';

const schema = z.object({
  companyName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(1),
}).refine(d => d.password === d.confirmPassword, {
  message: 'passwords_mismatch',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export function RegisterPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const result = await authApi.register(data.companyName, data.email, data.password);
      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast(t('auth.registerEmailTaken'), 'error');
      } else {
        toast(t('auth.registerError'), 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <CadreAuth>
      <div className="space-y-4">
        <div className="space-y-1 text-center">
          <h1>Echango Invoice</h1>
          <p className="text-sm text-muted-foreground">{t('auth.createAccount')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('auth.companyName')}</label>
            <Input autoComplete="organization" {...register('companyName')} />
            {errors.companyName && (
              <p className="text-xs text-destructive">{t('errors.minLength', { min: 2 })}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('auth.email')}</label>
            <Input type="email" autoComplete="email" {...register('email')} />
            {errors.email && (
              <p className="text-xs text-destructive">{t('errors.invalidEmail')}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('auth.password')}</label>
            <Input type="password" autoComplete="new-password" {...register('password')} />
            {errors.password && (
              <p className="text-xs text-destructive">{t('auth.passwordMin')}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('auth.confirmPassword')}</label>
            <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{t('auth.passwordMismatch')}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('common.loading') : t('auth.registerButton')}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            {t('auth.loginLink')}
          </Link>
        </p>
      </div>
    </CadreAuth>
  );
}
