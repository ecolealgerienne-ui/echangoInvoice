import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TableConteneur } from '@/components/ui/DataTable';
import { Pagination } from '@/components/shared/Pagination';
import { varianteStatut } from '@/lib/statuts';

/**
 * Liste des locataires — l'écran d'administration.
 *
 * Il était le dernier à ne rien partager avec le reste : `<input>` et
 * `<select>` nus, un tableau sans cadre, une pastille de statut dont la table
 * de couleurs était écrite ici, et une pagination faite de deux chevrons en
 * caractères d'écriture (`&lt;`, `&gt;`) qui ne disaient ni la page courante ni
 * le total. Un écran réservé à trois personnes reste un écran : c'est
 * précisément là qu'une divergence s'installe sans que personne ne la voie.
 *
 * Tout passe désormais par le système : `Input`, `Select`, `TableConteneur`,
 * `Badge` avec `varianteStatut`, `Pagination`. Le statut d'un locataire suit
 * donc le même code couleur qu'un statut de facture — actif en vert, essai en
 * ambre, suspendu en gris — décidé au même endroit.
 */
const TAILLE = 20;

export function AdminTenantsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', page, search, status],
    queryFn: () => adminApi.listTenants({
      page, limit: TAILLE, search: search || undefined, status: status || undefined,
    }),
  });

  const patchStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => adminApi.patchTenantStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  });

  const tenants = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="ci-page space-y-4 p-5">
      <h1>{t('admin.tenants.title')}</h1>

      <div className="flex flex-wrap gap-3">
        <Input
          className="w-64"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <Select
          className="w-48"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="trial">{t('admin.tenants.status.trial')}</option>
          <option value="active">{t('admin.tenants.status.active')}</option>
          <option value="suspended">{t('admin.tenants.status.suspended')}</option>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <TableConteneur>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-left">{t('common.customer')}</th>
                <th className="px-3 py-2.5 text-left">{t('common.status')}</th>
                <th className="px-3 py-2.5 text-left">{t('common.date')}</th>
                <th className="px-3 py-2.5 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant: any) => (
                <tr key={tenant.id}>
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/admin/tenants/${tenant.id}`}
                      className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge point variant={varianteStatut(tenant.status)}>
                      {t(`admin.tenants.status.${tenant.status}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString('fr-DZ')}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {tenant.status !== 'suspended' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => patchStatus.mutate({ id: tenant.id, s: 'suspended' })}
                      >
                        {t('admin.tenants.actions.suspend')}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => patchStatus.mutate({ id: tenant.id, s: 'active' })}
                      >
                        {t('admin.tenants.actions.activate')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableConteneur>
      )}

      {pagination && (
        <Pagination
          page={page}
          total={pagination.total}
          limit={TAILLE}
          onChange={setPage}
        />
      )}
    </div>
  );
}
