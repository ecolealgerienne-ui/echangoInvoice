import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '@/lib/api';

export function AdminTenantsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', page, search, status],
    queryFn: () => adminApi.listTenants({ page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const patchStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => adminApi.patchTenantStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  });

  const tenants = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-foreground">{t('admin.tenants.title')}</h1>

      <div className="flex gap-3">
        <input
          className="border border-border rounded px-3 py-1.5 text-sm bg-surface text-foreground"
          placeholder={t('common.search')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="border border-border rounded px-3 py-1.5 text-sm bg-surface text-foreground"
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="trial">{t('admin.tenants.status.trial')}</option>
          <option value="active">{t('admin.tenants.status.active')}</option>
          <option value="suspended">{t('admin.tenants.status.suspended')}</option>
        </select>
      </div>

      {isLoading ? (
        <div>{t('common.loading')}</div>
      ) : (
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.customer')}</th>
              <th className="text-left p-3 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.status')}</th>
              <th className="text-left p-3 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.date')}</th>
              <th className="text-left p-3 text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant: any) => (
              <tr key={tenant.id} className="border-t border-border">
                <td className="p-3 text-foreground">{tenant.name}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    tenant.status === 'active' ? 'bg-success-subtle text-success-text' :
                    tenant.status === 'trial' ? 'bg-warning-subtle text-warning-text' :
                    'bg-destructive-subtle text-destructive-text'
                  }`}>
                    {t(`admin.tenants.status.${tenant.status}`)}
                  </span>
                </td>
                <td className="p-3 text-foreground">{new Date(tenant.createdAt).toLocaleDateString('fr-DZ')}</td>
                <td className="p-3 flex gap-2">
                  <Link to={`/admin/tenants/${tenant.id}`} className="text-primary underline text-xs">
                    {t('admin.tenants.actions.detail')}
                  </Link>
                  {tenant.status !== 'suspended' ? (
                    <button
                      onClick={() => patchStatus.mutate({ id: tenant.id, s: 'suspended' })}
                      className="text-xs text-destructive underline"
                    >
                      {t('admin.tenants.actions.suspend')}
                    </button>
                  ) : (
                    <button
                      onClick={() => patchStatus.mutate({ id: tenant.id, s: 'active' })}
                      className="text-xs text-success underline"
                    >
                      {t('admin.tenants.actions.activate')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pagination && (
        <div className="flex gap-2 justify-end">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border border-border rounded text-sm disabled:opacity-50">
            &lt;
          </button>
          <span className="px-3 py-1 text-sm text-foreground">{page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= pagination.total} className="px-3 py-1 border border-border rounded text-sm disabled:opacity-50">
            &gt;
          </button>
        </div>
      )}
    </div>
  );
}
