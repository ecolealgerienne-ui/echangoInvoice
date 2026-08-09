import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi, suppliersApi, resolveApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Star } from 'lucide-react';
import { TableConteneur } from '@/components/ui/DataTable';

interface Lien {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierRef: string | null;
  purchasePrice: string | number;
  leadTimeDays: number | null;
  packQuantity: string | number;
  isPreferred: boolean;
}

/**
 * Fournisseurs d'un article.
 *
 * Le tri vient du serveur — préféré d'abord, puis du moins cher au plus cher :
 * c'est l'ordre dans lequel on lit une comparaison d'offres. Le délai compte
 * autant que le prix quand le stock est bas, il a donc sa colonne.
 */
export function FournisseursArticle({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [supplierId, setSupplierId] = useState('');
  const [ref, setRef] = useState('');
  const [prix, setPrix] = useState('');
  const [delai, setDelai] = useState('');

  const { data } = useQuery({
    queryKey: ['product-suppliers', productId],
    queryFn: () => productsApi.listerFournisseurs(productId),
  });
  const liens: Lien[] = data?.data ?? [];

  const { data: fournisseursData } = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => suppliersApi.list({ page: 1, limit: 200 }),
  });
  const fournisseurs = fournisseursData?.data ?? [];

  const ajout = useMutation({
    mutationFn: () => productsApi.ajouterFournisseur(productId, {
      supplierId,
      supplierRef: ref || undefined,
      purchasePrice: Number(prix) || 0,
      leadTimeDays: delai ? Number(delai) : undefined,
      // Le premier associé devient le préféré : sans cela, aucun ne l'est et
      // le réapprovisionnement n'a rien à proposer.
      isPreferred: liens.length === 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-suppliers', productId] });
      setSupplierId(''); setRef(''); setPrix(''); setDelai('');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const suppression = useMutation({
    mutationFn: (id: string) => productsApi.retirerFournisseur(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-suppliers', productId] }),
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const dejaAssocies = new Set(liens.map((l) => l.supplierId));

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t('products.suppliers')}</h2>
        <p className="text-xs text-muted-foreground">{t('products.suppliersHint')}</p>
      </div>

      {liens.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('products.noSupplier')}</p>
      )}

      {liens.length > 0 && (
        <TableConteneur dense>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">{t('suppliers.title')}</th>
                <th className="px-3 py-2 text-left">{t('products.supplierRef')}</th>
                <th className="px-3 py-2 text-right">{t('products.purchasePrice')}</th>
                <th className="px-3 py-2 text-right">{t('products.leadTime')}</th>
                <th className="px-3 py-2 text-2xs uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {liens.map((l) => (
                <tr key={l.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-2 text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {l.isPreferred && (
                        <Star className="h-3.5 w-3.5 fill-current text-warning" aria-label={t('products.preferred')} />
                      )}
                      {l.supplierName}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.supplierRef || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap tabular-nums">{formatCurrency(l.purchasePrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap tabular-nums">
                    {l.leadTimeDays != null ? `${l.leadTimeDays} j` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <Button variant="ghost" size="icon" onClick={() => suppression.mutate(l.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableConteneur>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (supplierId) ajout.mutate(); }}
      >
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('suppliers.title')}</label>
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-56">
            <option value="">{t('common.select')}</option>
            {fournisseurs
              .filter((f: any) => !dejaAssocies.has(f.id))
              .map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.supplierRef')}</label>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.purchasePrice')}</label>
          <Input type="number" step="0.01" min="0" value={prix}
            onChange={(e) => setPrix(e.target.value)} className="w-28" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('products.leadTime')}</label>
          <Input type="number" min="0" value={delai}
            onChange={(e) => setDelai(e.target.value)} className="w-24" />
        </div>
        <Button type="submit" size="sm" disabled={!supplierId || ajout.isPending}>
          <Plus className="h-4 w-4" /> {t('products.addSupplier')}
        </Button>
      </form>

      {liens.length > 1 && (
        <p className="text-xs text-muted-foreground">
          <Badge variant="secondary">{liens.length}</Badge>{' '}
          {t('products.suppliersCompare')}
        </p>
      )}
    </div>
  );
}
