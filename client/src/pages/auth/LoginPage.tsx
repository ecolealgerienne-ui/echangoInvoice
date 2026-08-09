import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { CadreAuth } from '@/components/layout/CadreAuth';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormData = z.infer<typeof schema>;

export function LoginPage() {
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
      const { role } = await login(data.email, data.password);
      navigate(role === 'superadmin' ? '/admin/dashboard' : '/dashboard');
    } catch {
      toast(t('auth.loginError'), 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <CadreAuth>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('auth.login')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('auth.email')}</label>
            <Input type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{t('errors.invalidEmail')}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('auth.password')}</label>
            <Input type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('common.loading') : t('auth.loginButton')}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-primary hover:underline font-medium">
            {t('auth.registerLink')}
          </Link>
        </p>
      </div>
    </CadreAuth>
  );
}
