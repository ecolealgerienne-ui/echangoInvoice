import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi, resolveApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Acceptation d'une invitation. Route publique : la personne invitée n'a pas
 * encore de compte, elle ne peut donc pas être authentifiée pour y accéder.
 */
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const token = params.get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 space-y-3">
          <h1>{t('users.acceptTitle')}</h1>
          <p className="text-sm text-destructive">{t('users.missingToken')}</p>
          <Link to="/login" className="text-sm text-primary underline">{t('auth.login')}</Link>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('users.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await authApi.acceptInvite(token, name.trim(), password);
      // acceptInvite renvoie la même charge que login : jetons + utilisateur.
      setSession(data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(resolveApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-6">
        <div>
          <h1>{t('users.acceptTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('users.acceptHint')}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">{t('users.name')} *</label>
          <Input value={name} onChange={e => setName(e.target.value)} required minLength={2} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">{t('auth.password')} *</label>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">{t('users.passwordHint')}</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">{t('users.passwordConfirm')} *</label>
          <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
        </div>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy || !name.trim() || password.length < 8}>
          {busy ? <LoadingSpinner size="sm" /> : t('users.acceptButton')}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary underline">{t('auth.login')}</Link>
        </p>
      </form>
    </div>
  );
}
