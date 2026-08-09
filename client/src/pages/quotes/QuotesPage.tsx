import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { quotesApi, customersApi, productsApi, settingsApi, deliveriesApi, resolveApiError } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { useUnits } from '@/lib/useUnits';
import { useCustomerPrices } from '@/lib/useCustomerPrices';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Search, FileDown, FileText, RefreshCw, Pencil, Send, CheckCircle, XCircle, Truck } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { useScanLignes } from '@/hooks/useScanLignes';
import { BandeauScan } from '@/components/shared/BandeauScan';
import { useSort } from '@/hooks/useSort';
import { EnteteTriable } from '@/components/shared/EnteteTriable';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';
import { enregistrerBlob } from '@/lib/download';
import { EtatVide } from '@/components/shared/EtatVide';
import { EnTetePage } from '@/components/shared/EnTetePage';
import { MenuActions } from '@/components/shared/MenuActions';
import { TableConteneur } from '@/components/ui/DataTable';


const itemSchema = z.object({
  finishedProductId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  taxRate1: z.coerce.number().min(0).max(100).optional(),
});

const schema = z.object({
  customerId: z.string().uuid(),
  quoteDate: z.string().min(1),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

/**
 * `z.coerce.number()` fait diverger l'entrée de la sortie du schéma : les
 * champs de taux et de quantité sont liés à des <Select>/<Input>, qui ne
 * manipulent que des chaînes, et zod les convertit à la validation.
 *
 * On type donc le formulaire sur l'entrée (chaînes acceptées) et le
 * callback de soumission sur la sortie (nombres garantis).
 */
type FormInput = z.input<typeof schema>;
type FormData = z.output<typeof schema>;

const today = new Date().toISOString().split('T')[0];
const in30 = new Date(Date.now() + 30 * 864e5).toISOString().split('T')[0];

export function QuotesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Colonnes triables = liste blanche du service ; toute autre rend un 400.
  const { tri, trierPar, ariaSort } = useSort<'quoteNumber' | 'quoteDate' | 'expiryDate' | 'totalAmount' | 'status' | 'createdAt'>(
    'quotes_sort', { sortBy: 'createdAt', sortOrder: 'DESC' },
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', page, search, status, tri],
    queryFn: () => quotesApi.list({ ...tri, page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 20, search: undefined }),
  });

  const { data: products } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });

  const units = useUnits();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const taxRates: { name: string; rate: number; isDefault: boolean }[] = settingsData?.data?.taxRates ?? [];
  const defaultTaxRate = parseFloat(String(taxRates.find(r => r.isDefault)?.rate ?? 19));

  const { register, handleSubmit, control, reset, watch: watchQ, setValue: setQValue, formState: { errors } } = useForm<FormInput, unknown, FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      quoteDate: today,
      expiryDate: in30,
      items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: defaultTaxRate }],
    },
  });

  const { priceFor, priceListName } = useCustomerPrices(watchQ('customerId'));

  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });

  // Saisie par douchette, active seulement quand la modale est ouverte.
  const scan = useScanLignes({
    actif: modalOpen,
    lignes: (watchQ('items') ?? []) as any[],
    ajouter: (l) => append(l as any),
    remplacer: (i, l) => update(i, l as any),
    majQuantite: (i, q) => setQValue(`items.${i}.quantity`, q as any),
    construireLigne: (produit, quantite) => ({
      finishedProductId: produit.id,
      quantity: quantite,
      unit: produit.unit || 'unité',
      unitPrice: Number(produit.defaultSalesPrice ?? 0),
      taxRate1: defaultTaxRate,
    }) as any,
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => editing ? quotesApi.update(editing.id, d) : quotesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      toast(editing ? t('common.save') + ' !' : t('quotes.created'), 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => quotesApi.updateStatus(id, { status: 'sent' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast(t('quotes.sent'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => quotesApi.updateStatus(id, { status: 'accepted' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast(t('quotes.accepted'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => quotesApi.updateStatus(id, { status: 'rejected' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast(t('quotes.rejected'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => quotesApi.convert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(t('quotes.converted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const createBlMutation = useMutation({
    mutationFn: (id: string) => quotesApi.createBl(id),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['delivery-notes'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast(t('quotes.convertedToBl'), 'success');
      if (res?.warnings?.length) {
        res.warnings.forEach((w: string) => toast(w, 'warning'));
      }
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => quotesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      toast(t('quotes.deleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() { setEditing(null); reset({ quoteDate: today, expiryDate: in30, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: defaultTaxRate }] }); setModalOpen(true); }

  /**
   * `?nouveau=1` ouvre le formulaire de création à l'arrivée — c'est ce qui
   * donne un sens au menu « + Nouveau » du tableau de bord. Le paramètre est
   * retiré aussitôt lu : un rafraîchissement de page rouvrirait sinon la
   * modale sans qu'on l'ait demandé.
   */
  const [parametres, setParametres] = useSearchParams();
  useEffect(() => {
    if (parametres.get('nouveau') !== '1') return;
    openCreate();
    const suite = new URLSearchParams(parametres);
    suite.delete('nouveau');
    setParametres(suite, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametres]);
  function openEdit(row: any) {
    quotesApi.get(row.id).then((res: any) => {
      const q = res.data ?? res;
      setEditing(q);
      reset({
        customerId: q.customerId,
        quoteDate: q.quoteDate?.slice(0, 10) ?? today,
        expiryDate: q.expiryDate?.slice(0, 10) ?? '',
        notes: q.notes ?? '',
        items: (q.items ?? []).map((it: any) => ({
          finishedProductId: it.finishedProductId,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          // parseFloat normalise le décimal renvoyé par l'API (« 19.00 » → 19)
          // pour qu'il corresponde à la valeur d'une option du Select.
          taxRate1: parseFloat(String(it.taxRate1 ?? defaultTaxRate)),
        })),
      });
      setModalOpen(true);
    }).catch(() => toast(t('errors.generic'), 'error'));
  }
  function closeModal() { setEditing(null); reset(); setModalOpen(false); }

  function downloadPdf(id: string, number: string) {
    quotesApi.pdf(id)
      .then((blob: Blob) => enregistrerBlob(blob, `${number}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  /**
   * La proforma est le même devis rendu comme une facture : offre chiffrée
   * exigée pour la domiciliation bancaire d'un import et par les marchés
   * publics. Même numéro, sans quoi elle se lirait comme une facture émise.
   */
  function downloadProforma(id: string, number: string) {
    quotesApi.pdfProforma(id)
      .then((blob: Blob) => enregistrerBlob(blob, `PROFORMA-${number}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  const quotes = data?.data ?? [];
  const pagination = data?.pagination;
  // L'union couvre toutes les colonnes du menu : « notes » est masquée par
  // défaut mais reste activable.
  const { visible, toggle, col } = useColumnVisibility<
    'number' | 'customer' | 'quoteDate' | 'expiryDate' | 'total' | 'status' | 'notes'
  >(
    'quotes_visible_columns',
    ['number', 'customer', 'quoteDate', 'expiryDate', 'total', 'status'],
  );
  const customerList = customers?.data ?? [];
  const productList = products?.data ?? [];

  return (
    <div className="space-y-4">
      <EnTetePage titre={t('quotes.title')} total={pagination?.total} cleTotal="quotes.totalCount">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />{t('quotes.new')}
        </Button>
      </EnTetePage>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('common.search')} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        {/* `Select` est `w-full` par défaut : sans largeur imposée, il prenait
            toute la ligne et rejetait la barre d'outils sur un deuxième rang.
            La liste des factures portait déjà `w-40` ; les deux écrans se
            ressemblent enfin. */}
        <Select className="w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('common.allStatuses')}</option>
          <option value="draft">{t('status.draft')}</option>
          <option value="sent">{t('status.sent')}</option>
          <option value="accepted">{t('status.accepted')}</option>
          <option value="rejected">{t('status.rejected')}</option>
          <option value="expired">{t('status.expired')}</option>
          <option value="converted">{t('status.converted')}</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <ExportButton dataset="devis" filtres={{ status }} />
          <ColumnToggleMenu
            columns={[
              { key: 'number', label: t('quotes.quoteNumber') },
              { key: 'customer', label: t('customers.title') },
              { key: 'quoteDate', label: t('quotes.quoteDate') },
              { key: 'expiryDate', label: t('quotes.expiryDate') },
              { key: 'total', label: t('common.totalTtc') },
              { key: 'status', label: t('quotes.status') },
              { key: 'notes', label: t('common.notes') },
            ]}
            visible={visible}
            onToggle={toggle}
          />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <TableConteneur>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {col('number') && (
                  <EnteteTriable libelle={t('quotes.quoteNumber')} colonne="quoteNumber" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('customer') && <th className="text-left px-3 py-2.5">{t('customers.title')}</th>}
                {col('quoteDate') && (
                  <EnteteTriable libelle={t('quotes.quoteDate')} colonne="quoteDate" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('expiryDate') && (
                  <EnteteTriable libelle={t('quotes.expiryDate')} colonne="expiryDate" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('total') && (
                  <EnteteTriable libelle={t('common.totalTtc')} colonne="totalAmount" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} droite />
                )}
                {col('status') && (
                  <EnteteTriable libelle={t('quotes.status')} colonne="status" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('notes') && <th className="text-left px-3 py-2.5">{t('common.notes')}</th>}
                <th className="px-3 py-2.5 text-2xs uppercase tracking-wide text-muted-foreground" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q: any) => (
                <tr key={q.id} className="border-t border-border hover:bg-surface-hover">
                  {col('number') && (
                    <td className="px-3 py-2.5 font-mono text-xs">
                      <Link to={`/quotes/${q.id}`} className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline">
                        {q.quoteNumber}
                      </Link>
                    </td>
                  )}
                  {col('customer') && <td className="px-3 py-2.5">{q.customer?.name ?? '—'}</td>}
                  {col('quoteDate') && <td className="px-3 py-2.5">{formatDate(q.quoteDate)}</td>}
                  {col('expiryDate') && <td className="px-3 py-2.5">{q.expiryDate ? formatDate(q.expiryDate) : '—'}</td>}
                  {col('total') && <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">{formatCurrency(q.totalAmount)}</td>}
                  {col('status') && <td className="px-3 py-2.5"><Badge variant={varianteStatut(q.status)}>{t(`status.${q.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-3 py-2.5 text-muted-foreground text-xs">{q.notes || '—'}</td>}
                  {/* Le PDF reste dehors — c'est ce qu'on envoie au client, et
                      donc le geste dominant d'un devis. La proforma rejoint le
                      menu : elle est demandée par exception. */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button size="sm" variant="ghost" title={t('common.pdf')} onClick={() => downloadPdf(q.id, q.quoteNumber)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                      <MenuActions
                        actions={[
                          q.status === 'sent' && {
                            cle: 'accept', libelle: t('quotes.accept'), icone: CheckCircle,
                            onSelect: () => acceptMutation.mutate(q.id),
                          },
                          q.status === 'accepted' && {
                            cle: 'convert', libelle: t('quotes.convert'), icone: RefreshCw,
                            onSelect: () => convertMutation.mutate(q.id),
                          },
                          q.status === 'accepted' && {
                            cle: 'bl', libelle: t('quotes.createBl'), icone: Truck,
                            onSelect: () => createBlMutation.mutate(q.id),
                          },
                          q.status === 'draft' && {
                            cle: 'send', libelle: t('quotes.send'), icone: Send,
                            onSelect: () => sendMutation.mutate(q.id),
                          },
                          ['draft', 'sent'].includes(q.status) && {
                            cle: 'edit', libelle: t('common.edit'), icone: Pencil,
                            onSelect: () => openEdit(q),
                          },
                          {
                            cle: 'proforma', libelle: t('quotes.proforma'), icone: FileText,
                            onSelect: () => downloadProforma(q.id, q.quoteNumber),
                          },
                          q.status === 'sent' && {
                            cle: 'reject', libelle: t('quotes.reject'), icone: XCircle, danger: true,
                            onSelect: () => rejectMutation.mutate(q.id),
                          },
                          ['draft', 'rejected'].includes(q.status) && {
                            cle: 'delete', libelle: t('common.delete'), icone: Trash2, danger: true,
                            onSelect: () => removeMutation.mutate(q.id),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="px-4 py-2 text-center text-muted-foreground"><EtatVide /></td></tr>
              )}
            </tbody>
          </table>
        </TableConteneur>
      )}

      {pagination && (
        <Pagination page={page} total={pagination.total} limit={pagination.limit} onChange={setPage} />
      )}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('quotes.new')} size="xl">
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">{t('customers.title')}</label>
              <Select {...register('customerId')} className="mt-1 w-full">
                <option value="">{t('common.select')}</option>
                {customerList.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              {errors.customerId && <p className="text-xs text-destructive mt-1">{t('errors.required')}</p>}
              {priceListName && (
                <p className="text-xs text-primary mt-1">{t('priceLists.applied', { name: priceListName })}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">{t('quotes.quoteDate')}</label>
              <Input type="date" {...register('quoteDate')} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t('quotes.expiryDate')}</label>
              <Input type="date" {...register('expiryDate')} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{t('common.items')}</label>
              <BandeauScan onScan={scan.traiter} enCours={scan.enCours} dernier={scan.dernier} />
              <Button type="button" size="sm" variant="outline"
                onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: defaultTaxRate })}>
                <Plus className="h-3 w-3 mr-1" />{t('common.add')}
              </Button>
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 mb-1">
              <div className="col-span-3 text-xs font-medium text-muted-foreground">{t('common.product')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('common.qty')}</div>
              <div className="col-span-1 text-xs font-medium text-muted-foreground">{t('products.unit')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('purchases.unitPrice')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground">{t('settings.taxRate')}</div>
              <div className="col-span-2 text-xs font-medium text-muted-foreground text-right">TTC</div>
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => {
                const selId = watchQ(`items.${i}.finishedProductId`);
                const selProd = (productList as any[]).find((p: any) => p.id === selId);
                const lineHT = (Number(watchQ(`items.${i}.quantity`)) || 0) * (Number(watchQ(`items.${i}.unitPrice`)) || 0);
                const lineTaxRate = Number(watchQ(`items.${i}.taxRate1`)) || 0;
                const lineTTC = lineHT * (1 + lineTaxRate / 100);
                return (
                <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Select {...register(`items.${i}.finishedProductId`)} className="w-full text-xs"
                      onChange={e => {
                        setQValue(`items.${i}.finishedProductId`, e.target.value);
                        const prod = (productList as any[]).find((p: any) => p.id === e.target.value);
                        if (prod?.unit) setQValue(`items.${i}.unit`, prod.unit);
                        const prixPropose = prod ? priceFor(prod) : undefined;
                        if (prixPropose != null) setQValue(`items.${i}.unitPrice`, prixPropose);
                      }}>
                      <option value="">{t('products.title')}</option>
                      {(productList as any[]).map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} className="text-xs" />
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground block text-center truncate">
                      {selProd?.unit ?? watchQ(`items.${i}.unit`) ?? '—'}
                    </span>
                    <input type="hidden" {...register(`items.${i}.unit`)} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" min="0" placeholder="P.U. HT" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Select {...register(`items.${i}.taxRate1`)} className="w-full text-xs">
                      {taxRates.length > 0
                        ? taxRates.map(r => { const v = String(parseFloat(String(r.rate))); return <option key={v} value={v}>{v}%</option>; })
                        : <option value="19">19%</option>
                      }
                    </Select>
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-xs font-medium text-foreground text-right whitespace-nowrap block">{formatCurrency(lineTTC)}</span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {fields.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
            {/* Totals summary */}
            {(() => {
              const watchedItems = watchQ('items') ?? [];
              const subtotalHT = watchedItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
              const totalTVA = watchedItems.reduce((s, it) => {
                const ht = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
                return s + ht * (Number(it.taxRate1) || 0) / 100;
              }, 0);
              return (
                <div className="flex justify-end gap-6 text-sm border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground">{t('purchases.subtotal')} : <span className="font-medium text-foreground">{formatCurrency(subtotalHT)}</span></span>
                  <span className="text-muted-foreground">{t('purchases.taxAmount')} : <span className="font-medium text-foreground">{formatCurrency(totalTVA)}</span></span>
                  <span className="font-semibold">{t('common.totalTtc')} : {formatCurrency(subtotalHT + totalTVA)}</span>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="text-sm font-medium">{t('quotes.notes')}</label>
            <textarea {...register('notes')} rows={2}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <LoadingSpinner size="sm" /> : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
