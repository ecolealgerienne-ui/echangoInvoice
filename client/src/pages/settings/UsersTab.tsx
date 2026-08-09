import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi, usersApi, resolveApiError } from '@/lib/api';
import { varianteRole } from '@/lib/statuts';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/contexts/AuthContext';
import { Copy, Trash2, UserPlus } from 'lucide-react';


/**
 * Gestion des membres de l'espace.
 *
 * Composant à part et rendu HORS du formulaire des paramètres : la page
 * Paramètres est un unique <form> avec un bouton « Enregistrer », alors qu'ici
 * chaque action s'applique immédiatement. Les imbriquer aurait fait soumettre
 * les paramètres à chaque invitation.
 */
export function UsersTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user: courant } = useAuth();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'agent'>('agent');
  const [dernierLien, setDernierLien] = useState<string | null>(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const { data: invitationsData } = useQuery({
    queryKey: ['users-invitations'],
    queryFn: () => usersApi.listInvitations(),
  });

  const { data: quotaData } = useQuery({
    queryKey: ['users-quota'],
    queryFn: () => usersApi.quota(),
  });

  function rafraichir() {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['users-invitations'] });
    qc.invalidateQueries({ queryKey: ['users-quota'] });
  }

  const inviteMutation = useMutation({
    mutationFn: () => authApi.invite(email.trim(), role),
    onSuccess: (res: any) => {
      setDernierLien(res?.inviteUrl ?? null);
      setEmail('');
      rafraichir();
      // On dit ce qui s'est réellement passé : annoncer « invitation envoyée »
      // quand le SMTP a échoué laissait l'utilisateur attendre un e-mail qui
      // n'arriverait jamais.
      toast(res?.emailSent ? t('users.inviteSent') : t('users.inviteLinkOnly'),
        res?.emailSent ? 'success' : 'warning');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => usersApi.update(id, body),
    onSuccess: () => { rafraichir(); toast(t('common.save') + ' !', 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => usersApi.revokeInvitation(id),
    onSuccess: () => { rafraichir(); toast(t('users.inviteRevoked'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function copier(lien: string) {
    navigator.clipboard.writeText(lien)
      .then(() => toast(t('users.linkCopied'), 'success'))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  const quota = quotaData?.data;
  const complet = quota && quota.limite != null && quota.occupees >= quota.limite;
  const estProprietaire = courant?.role === 'owner';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t('users.invite')}</span>
            {quota && (
              <span className="text-xs font-normal text-muted-foreground">
                {quota.limite == null
                  ? t('users.quotaUnlimited', { count: quota.occupees })
                  : t('users.quota', { used: quota.occupees, limit: quota.limite })}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1 flex-1 min-w-[220px]">
              <label className="text-sm font-medium text-foreground">{t('auth.email')}</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="collaborateur@entreprise.dz"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('users.role')}</label>
              <Select value={role} onChange={e => setRole(e.target.value as 'manager' | 'agent')} className="w-40">
                <option value="agent">{t('users.roles.agent')}</option>
                <option value="manager">{t('users.roles.manager')}</option>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => inviteMutation.mutate()}
              disabled={!email.trim() || inviteMutation.isPending || !!complet}
            >
              <UserPlus className="h-4 w-4" /> {t('users.invite')}
            </Button>
          </div>

          {complet && (
            <p className="text-sm text-destructive">{t('users.quotaReached')}</p>
          )}

          {dernierLien && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">{t('users.linkTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('users.linkHint')}</p>
              <div className="flex gap-2">
                <Input readOnly value={dernierLien} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={() => copier(dernierLien)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {invitationsData?.data?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('users.pending')}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr>
                <th className="px-3 py-2.5 text-left">{t('auth.email')}</th>
                <th className="px-3 py-2.5 text-left">{t('users.role')}</th>
                <th className="px-3 py-2.5 text-left">{t('users.expiresAt')}</th>
                <th className="px-3 py-2.5 text-right">{t('common.actions')}</th>
              </tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {invitationsData.data.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-surface-hover">
                    <td className="px-3 py-2.5 text-foreground">{inv.email}</td>
                    <td className="px-3 py-2.5"><Badge variant={varianteRole(inv.role)}>{t(`users.roles.${inv.role}`)}</Badge></td>
                    <td className="px-3 py-2.5">
                      {inv.expired
                        ? <Badge variant="destructive">{t('users.expired')}</Badge>
                        : <span className="text-muted-foreground">{formatDate(inv.expiresAt)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      <div className="flex justify-end gap-1">
                        {!inv.expired && (
                          <Button variant="ghost" size="icon" title={t('users.copyLink')}
                            onClick={() => copier(`${window.location.origin}/accept-invite?token=${inv.token}`)}>
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title={t('users.revoke')}
                          onClick={() => revokeMutation.mutate(inv.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t('users.members')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-6"><LoadingSpinner /></div> : (
            <table className="w-full text-sm">
              <thead><tr>
                <th className="px-3 py-2.5 text-left">{t('users.name')}</th>
                <th className="px-3 py-2.5 text-left">{t('auth.email')}</th>
                <th className="px-3 py-2.5 text-left">{t('users.role')}</th>
                <th className="px-3 py-2.5 text-center">{t('common.status')}</th>
              </tr></thead>
              <tbody className="divide-y divide-border-subtle">
                {usersData?.data?.map((u: any) => {
                  const soiMeme = u.id === courant?.id;
                  return (
                    <tr key={u.id} className="hover:bg-surface-hover">
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {u.name}
                        {soiMeme && <span className="ml-2 text-xs text-muted-foreground">({t('users.you')})</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
                      <td className="px-3 py-2.5">
                        {/* Seul le propriétaire distribue les rôles, et jamais
                            le sien : le backend refuse les deux cas. */}
                        {estProprietaire && !soiMeme ? (
                          <Select
                            value={u.role}
                            onChange={e => updateMutation.mutate({ id: u.id, body: { role: e.target.value } })}
                            className="w-36"
                          >
                            <option value="owner">{t('users.roles.owner')}</option>
                            <option value="manager">{t('users.roles.manager')}</option>
                            <option value="agent">{t('users.roles.agent')}</option>
                          </Select>
                        ) : (
                          <Badge variant={varianteRole(u.role)}>{t(`users.roles.${u.role}`)}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {estProprietaire && !soiMeme ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateMutation.mutate({ id: u.id, body: { isActive: !u.isActive } })}
                          >
                            <Badge variant={u.isActive ? 'success' : 'muted'}>
                              {u.isActive ? t('users.active') : t('users.inactive')}
                            </Badge>
                          </Button>
                        ) : (
                          <Badge variant={u.isActive ? 'success' : 'muted'}>
                            {u.isActive ? t('users.active') : t('users.inactive')}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
