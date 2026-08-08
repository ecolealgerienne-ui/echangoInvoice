import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { priceListsApi, productsApi, resolveApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2, Tags, Search, RotateCcw } from 'lucide-react';

/**
 * Grilles tarifaires.
 *
 * Un article n'avait qu'un prix unique : impossible de servir un détaillant et
 * une centrale au même catalogue. La grille donne un prix par client, proposé
 * à la saisie et toujours modifiable sur la ligne.
 */
export function PriceListsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');

  const [gridId, setGridId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  // Prix en cours d'édition, saisis en chaîne : un champ vidé doit rester vide
  // plutôt que de retomber à 0, qui serait un prix valide et faux.
  const [prix, setPrix] = useState<Record<string, string>>({});

  const { data: listsData, isLoading } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => priceListsApi.list(),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products-all-for-pricing'],
    queryFn: () => productsApi.list({ limit: 500 }),
    enabled: !!gridId,
  });

  const { data: detailData, isFetching: detailLoading } = useQuery({
    queryKey: ['price-list', gridId],
    queryFn: async () => {
      const res = await priceListsApi.get(gridId!);
      const initial: Record<string, string> = {};
      for (const it of res.data.items ?? []) initial[it.finishedProductId] = String(it.unitPrice);
      setPrix(initial);
      return res;
    },
    enabled: !!gridId,
  });

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? priceListsApi.update(editing.id, { name: nom.trim(), description: description || undefined })
      : priceListsApi.create({ name: nom.trim(), description: description || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      toast(t('common.save') + ' !', 'success');
      fermerModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => priceListsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      toast(t('common.deleted'), 'success');
      setGridId(null);
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const itemsMutation = useMutation({
    mutationFn: () => {
      // Seuls les articles réellement tarifés partent : un champ vide signifie
      // « pas de prix spécifique », donc retour au tarif de base.
      const items = Object.entries(prix)
        .filter(([, v]) => v !== '' && Number.isFinite(Number(v)))
        .map(([finishedProductId, v]) => ({ finishedProductId, unitPrice: Number(v) }));
      return priceListsApi.setItems(gridId!, items);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-lists'] });
      qc.invalidateQueries({ queryKey: ['price-list', gridId] });
      toast(t('priceLists.pricesSaved'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function ouvrirCreation() {
    setEditing(null); setNom(''); setDescription(''); setModalOpen(true);
  }
  function ouvrirEdition(g: any) {
    setEditing(g); setNom(g.name); setDescription(g.description ?? ''); setModalOpen(true);
  }
  function fermerModal() {
    setModalOpen(false); setEditing(null); setNom(''); setDescription('');
  }

  const produits = productsData?.data ?? [];
  const produitsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return produits;
    return produits.filter((p: any) =>
      p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q));
  }, [produits, recherche]);

  const nbTarifes = Object.values(prix).filter(v => v !== '').length;
  const grille = detailData?.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" /> {t('priceLists.title')}
        </h1>
        <Button onClick={ouvrirCreation} size="sm">
          <Plus className="h-4 w-4" /> {t('priceLists.new')}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{t('priceLists.hint')}</p>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('priceLists.name')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('common.description')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('priceLists.itemCount')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('priceLists.customerCount')}</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {listsData?.data?.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t('priceLists.empty')}</td></tr>
              )}
              {listsData?.data?.map((g: any) => (
                <tr key={g.id} className={`hover:bg-muted/30 ${gridId === g.id ? 'bg-muted/40' : ''}`}>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-foreground hover:text-primary"
                      onClick={() => { setGridId(gridId === g.id ? null : g.id); setRecherche(''); }}
                    >
                      {g.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{g.description || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={g.itemCount > 0 ? 'info' : 'muted'}>{g.itemCount}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={g.customerCount > 0 ? 'success' : 'muted'}>{g.customerCount}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('common.edit')} onClick={() => ouvrirEdition(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title={t('common.delete')}
                        onClick={() => deleteMutation.mutate(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gridId && (
        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4 flex-wrap">
            <div>
              <h2 className="font-semibold text-foreground">{grille?.name}</h2>
              <p className="text-xs text-muted-foreground">
                {t('priceLists.pricedCount', { count: nbTarifes })}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('common.search')} value={recherche}
                  onChange={e => setRecherche(e.target.value)} className="pl-9" />
              </div>
              <Button onClick={() => itemsMutation.mutate()} disabled={itemsMutation.isPending}>
                {itemsMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
              </Button>
            </div>
          </div>

          {detailLoading ? <div className="p-6"><LoadingSpinner /></div> : (
            <div className="max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0"><tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('products.name')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('priceLists.basePrice')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('priceLists.gridPrice')}</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('priceLists.delta')}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {produitsFiltres.map((p: any) => {
                    const base = Number(p.defaultSalesPrice ?? 0);
                    const valeur = prix[p.id] ?? '';
                    const saisi = valeur !== '' ? Number(valeur) : null;
                    const ecart = saisi != null && base > 0
                      ? Math.round(((saisi - base) / base) * 1000) / 10
                      : null;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2 text-foreground">
                          {p.name} <span className="text-xs text-muted-foreground">({p.unit})</span>
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{formatCurrency(base)}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number" step="0.01" min="0"
                              value={valeur}
                              placeholder="—"
                              onChange={e => setPrix(prev => ({ ...prev, [p.id]: e.target.value }))}
                              className="w-32 text-right"
                            />
                            {valeur !== '' && (
                              <Button variant="ghost" size="icon" title={t('priceLists.resetToBase')}
                                onClick={() => setPrix(prev => ({ ...prev, [p.id]: '' }))}>
                                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className={`px-4 py-2 text-right ${ecart == null ? 'text-muted-foreground' : ecart < 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {ecart == null ? '—' : `${ecart > 0 ? '+' : ''}${ecart} %`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={fermerModal}
        title={editing ? t('common.edit') : t('priceLists.new')}>
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('priceLists.name')} *</label>
            <Input value={nom} onChange={e => setNom(e.target.value)} required minLength={2}
              placeholder="Grossistes, Détaillants, Export…" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('common.description')}</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={fermerModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!nom.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
