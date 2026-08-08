import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { invoicesApi, customersApi, productsApi, settingsApi, resolveApiError } from '@/lib/api';
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
import { Plus, Trash2, Search, Send, XCircle, CreditCard, FileDown, Pencil, RotateCcw, Mail, History } from 'lucide-react';
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


const itemSchema = z.object({
  finishedProductId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  taxRate1: z.coerce.number().min(0).max(100).optional(),
});

const MODES_REGLEMENT = ['other', 'cash', 'bank_transfer', 'cheque'] as const;

const schema = z.object({
  customerId: z.string().uuid(),
  invoiceDate: z.string().min(1),
  dueDate: z.string().min(1),
  // Le droit de timbre en découle, mais il est calculé côté serveur (R008) :
  // le front ne transmet que l'intention de règlement.
  paymentMode: z.enum(MODES_REGLEMENT).default('other'),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentDate: z.string().min(1),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'cheque', 'other']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type PaymentFormData = z.infer<typeof paymentSchema>;

const today = new Date().toISOString().split('T')[0];

export function InvoicesPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Colonnes triables = liste blanche du service ; toute autre rend un 400.
  const { tri, trierPar, ariaSort } = useSort<'invoiceNumber' | 'invoiceDate' | 'dueDate' | 'totalAmount' | 'amountDue' | 'status' | 'createdAt'>(
    'invoices_sort', { sortBy: 'createdAt', sortOrder: 'DESC' },
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  /**
   * Le filtre de statut vit dans l'URL, pas dans un état local.
   *
   * C'est ce qui rend `/invoices?status=overdue` adressable : le bloc « À
   * traiter » du tableau de bord y envoie, et la liste s'ouvre déjà filtrée
   * sur ce qu'on est venu voir. Un état local aurait ignoré le paramètre et
   * affiché toutes les factures — le clic aurait tenu une demi-promesse.
   *
   * L'URL devient au passage partageable : « regarde les impayées » se colle
   * dans un message.
   */
  const [parametres, setParametres] = useSearchParams();
  const status = parametres.get('status') ?? '';
  function changerStatut(valeur: string) {
    const suivants = new URLSearchParams(parametres);
    if (valeur) suivants.set('status', valeur); else suivants.delete('status');
    // `replace` : filtrer n'est pas naviguer, et le retour du navigateur doit
    // ramener à l'écran précédent, pas défaire un filtre à la fois.
    setParametres(suivants, { replace: true });
    setPage(1);
  }
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<any>(null);
  const [historyInvoice, setHistoryInvoice] = useState<any>(null);
  // Le type doit être explicite : l'union déduite du tableau par défaut
  // n'inclurait pas « credited », volontairement masquée au départ. Elle
  // n'intéresse que les factures touchées par un avoir, mais doit rester
  // activable pour expliquer un solde qui a baissé sans encaissement.
  const { visible, toggle, col } = useColumnVisibility<
    'number' | 'customer' | 'origin' | 'invoiceDate' | 'dueDate'
    | 'amount' | 'credited' | 'due' | 'status' | 'notes'
  >(
    'invoices_visible_columns',
    ['number', 'customer', 'origin', 'invoiceDate', 'dueDate', 'amount', 'due', 'status', 'notes'],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, search, status, tri],
    queryFn: () => invoicesApi.list({ ...tri, page, limit: 20, search: search || undefined, status: status || undefined }),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers', 1, ''],
    queryFn: () => customersApi.list({ page: 1, limit: 200, search: undefined }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 1, '', 'all'],
    queryFn: () => productsApi.list({ page: 1, limit: 200 }),
  });
  const productList = productsData?.data ?? [];
  useUnits();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
    staleTime: 5 * 60 * 1000,
  });
  const taxRates: { name: string; rate: number; isDefault: boolean }[] = settingsData?.data?.taxRates ?? [];
  const defaultTaxRate = parseFloat(String(taxRates.find(r => r.isDefault)?.rate ?? 19));
  const paymentDays: number = settingsData?.data?.defaultPaymentTermsDays ?? 30;
  const inN = new Date(Date.now() + paymentDays * 864e5).toISOString().split('T')[0];

  const { register, handleSubmit, control, reset, watch: watchInv, setValue: setInvValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { invoiceDate: today, dueDate: inN, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] },
  });
  const { fields, append, remove, update } = useFieldArray({ control, name: 'items' });

  // Saisie par douchette. Active seulement quand la modale est ouverte : sinon
  // le lecteur écrirait dans le vide depuis n'importe quel écran.
  const lignesCourantes = watchInv('items') ?? [];
  const scan = useScanLignes({
    actif: modalOpen,
    lignes: lignesCourantes as any[],
    ajouter: (l) => append(l as any),
    remplacer: (i, l) => update(i, l as any),
    majQuantite: (i, q) => setInvValue(`items.${i}.quantity`, q as any),
    construireLigne: (produit, quantite) => ({
      finishedProductId: produit.id,
      quantity: quantite,
      unit: produit.unit || 'unité',
      // Même règle que la sélection manuelle : grille du client si elle existe.
      unitPrice: priceFor(produit as any) ?? Number(produit.defaultSalesPrice ?? 0),
      taxRate1: String(defaultTaxRate),
    }) as any,
  });

  // Grille tarifaire du client sélectionné : le prix proposé à chaque ligne
  // en dépend, il doit donc suivre le changement de client.
  const { priceFor, priceListName } = useCustomerPrices(watchInv('customerId'));

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paymentDate: today, paymentMethod: 'bank_transfer' },
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => editing ? invoicesApi.update(editing.id, d) : invoicesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(editing ? t('common.save') + ' !' : t('invoices.created'), 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.send(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.sent'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.cancel(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.cancelled'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.reopen(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('invoices.status.draft'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast(t('common.deleted'), 'success'); },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const sendEmailMutation = useMutation({
    mutationFn: (id: string) => invoicesApi.sendEmail(id),
    onSuccess: () => toast(t('invoices.emailSent'), 'success'),
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  // Règlements de la facture ouverte dans la modale d'historique. La requête
  // ne part que quand une facture est sélectionnée.
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['invoice-payments', historyInvoice?.id],
    queryFn: () => invoicesApi.payments(historyInvoice.id),
    enabled: !!historyInvoice,
  });

  const removePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => invoicesApi.removePayment(paymentId),
    onSuccess: () => {
      // La facture change aussi (amountPaid, amountDue, status) : les deux
      // listes doivent repartir.
      qc.invalidateQueries({ queryKey: ['invoice-payments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast(t('invoices.paymentCancelled'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const paymentMutation = useMutation({
    mutationFn: (d: PaymentFormData) =>
      invoicesApi.addPayment({ ...d, salesInvoiceId: paymentInvoice.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-payments'] });
      toast(t('invoices.paymentAdded'), 'success');
      setPaymentInvoice(null);
      paymentForm.reset({ paymentDate: today, paymentMethod: 'bank_transfer' });
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  function openCreate() {
    setEditing(null);
    reset({ invoiceDate: today, dueDate: inN, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] });
    setModalOpen(true);
  }

  function openEdit(inv: any) {
    invoicesApi.get(inv.id).then((res: any) => {
      const d = res.data ?? res;
      setEditing(d);
      reset({
        customerId: d.customerId,
        invoiceDate: d.invoiceDate?.slice(0, 10) ?? today,
        dueDate: d.dueDate?.slice(0, 10) ?? inN,
        notes: d.notes ?? '',
        items: (d.items ?? []).map((it: any) => ({
          finishedProductId: it.finishedProductId,
          quantity: Number(it.quantity),
          unit: it.unit,
          unitPrice: Number(it.unitPrice),
          taxRate1: String(parseFloat(String(it.taxRate1 ?? defaultTaxRate))),
        })),
      });
      setModalOpen(true);
    }).catch(() => toast(t('errors.generic'), 'error'));
  }

  function closeModal() {
    setEditing(null);
    setModalOpen(false);
    reset({ invoiceDate: today, dueDate: inN, items: [{ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any }] });
  }

  function downloadPdf(id: string, number: string) {
    invoicesApi.pdf(id)
      .then((blob: Blob) => enregistrerBlob(blob, `${number}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <EnTetePage titre={t('invoices.title')} total={data?.pagination?.total} cleTotal="invoices.totalCount">
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('invoices.new')}
        </Button>
      </EnTetePage>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={status} onChange={e => changerStatut(e.target.value)} className="w-40">
          <option value="">{t('common.allStatuses')}</option>
          {['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled'].map(s => (
            <option key={s} value={s}>{t(`invoices.status.${s}`)}</option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {/* Trois fichiers, trois usages : l'en-tête des factures pour le
              journal de ventes, le détail des lignes pour l'analyse par
              article, les encaissements pour le rapprochement bancaire. Le
              filtre de statut ne s'applique qu'aux deux premiers — un
              encaissement n'a pas de statut. */}
          <ExportButton dataset="factures" filtres={{ status }} libelle={t('invoices.exportInvoices')} />
          <ExportButton dataset="lignes-factures" filtres={{ status }} libelle={t('invoices.exportLines')} />
          <ExportButton dataset="encaissements" libelle={t('invoices.exportPayments')} />
          <ColumnToggleMenu
            columns={[
              { key: 'number', label: t('invoices.number') },
              { key: 'customer', label: t('invoices.customer') },
              { key: 'origin', label: t('invoices.origin') },
              { key: 'invoiceDate', label: t('invoices.invoiceDate') },
              { key: 'dueDate', label: t('invoices.dueDate') },
              { key: 'amount', label: t('invoices.amount') },
              { key: 'credited', label: t('invoices.credited') },
              { key: 'due', label: t('invoices.due') },
              { key: 'status', label: t('common.status') },
              { key: 'notes', label: t('common.notes') },
            ]}
            visible={visible}
            onToggle={toggle}
          />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {col('number') && (
                  <EnteteTriable libelle={t('invoices.number')} colonne="invoiceNumber" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('customer') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.customer')}</th>}
                {col('origin') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.origin')}</th>}
                {col('invoiceDate') && (
                  <EnteteTriable libelle={t('invoices.invoiceDate')} colonne="invoiceDate" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('dueDate') && (
                  <EnteteTriable libelle={t('invoices.dueDate')} colonne="dueDate" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('amount') && (
                  <EnteteTriable libelle={t('invoices.amount')} colonne="totalAmount" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} droite />
                )}
                {col('credited') && <th className="px-3 py-2.5 text-right font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.credited')}</th>}
                {col('due') && (
                  <EnteteTriable libelle={t('invoices.due')} colonne="amountDue" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} droite />
                )}
                {col('status') && (
                  <EnteteTriable libelle={t('common.status')} colonne="status" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} droite />
                )}
                {col('notes') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.notes')}</th>}
                <th className="px-3 py-2.5 text-right font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-2 text-muted-foreground"><EtatVide /></td></tr>
              )}
              {data?.data?.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  {/* Le numéro est le point d'entrée vers la fiche : c'est ce
                      qu'on cherche du regard, et un lien y mène sans occuper
                      une colonne d'actions déjà chargée. */}
                  {col('number') && (
                    <td className="px-3 py-2.5 font-mono font-medium">
                      <Link to={`/invoices/${inv.id}`} className="text-primary hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                  )}
                  {col('customer') && <td className="px-3 py-2.5 text-foreground">{inv.customer?.name ?? '—'}</td>}
                  {col('origin') && <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{inv.blNumber ?? inv.quoteNumber ?? '—'}</td>}
                  {col('invoiceDate') && <td className="px-3 py-2.5 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>}
                  {col('dueDate') && <td className="px-3 py-2.5 text-muted-foreground">{formatDate(inv.dueDate)}</td>}
                  {col('amount') && <td className="px-3 py-2.5 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(inv.totalAmount)}</td>}
                  {col('credited') && (
                    <td className="px-3 py-2.5 text-right text-muted-foreground whitespace-nowrap tabular-nums">
                      {Number(inv.creditedAmount) > 0 ? formatCurrency(inv.creditedAmount) : '—'}
                    </td>
                  )}
                  {col('due') && <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap tabular-nums">{formatCurrency(inv.amountDue)}</td>}
                  {col('status') && <td className="px-3 py-2.5 text-center"><Badge variant={varianteStatut(inv.status)}>{t(`invoices.status.${inv.status}`)}</Badge></td>}
                  {col('notes') && <td className="px-3 py-2.5 text-muted-foreground text-xs">{inv.notes || '—'}</td>}
                  {/* Le PDF reste dehors : c'est le seul geste qu'on refait
                      dix fois dans la journée, et l'enfouir aurait ajouté deux
                      clics à la tâche la plus fréquente de l'écran. Tout le
                      reste — envoyer, encaisser, annuler, supprimer — attend
                      d'être demandé, et se présente avec son libellé écrit
                      plutôt qu'en icône à deviner. */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" title={t('common.pdf')} onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}>
                        <FileDown className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <MenuActions
                        actions={[
                          // Le règlement d'abord : c'est l'action qui fait
                          // avancer la facture, et la seule qu'on cherche sur
                          // une ligne en retard.
                          ['sent', 'partial', 'overdue'].includes(inv.status) && Number(inv.amountDue) > 0 && {
                            cle: 'payment',
                            libelle: t('invoices.addPayment'),
                            icone: CreditCard,
                            onSelect: () => { setPaymentInvoice(inv); paymentForm.setValue('amount', Number(inv.amountDue)); },
                          },
                          inv.status === 'draft' && {
                            cle: 'send', libelle: t('invoices.send'), icone: Send,
                            onSelect: () => sendMutation.mutate(inv.id),
                          },
                          // Envoi par e-mail : pas sur un brouillon (pas encore
                          // émis) ni sur une facture annulée.
                          !['draft', 'cancelled'].includes(inv.status) && {
                            cle: 'email', libelle: t('invoices.sendEmail'), icone: Mail,
                            desactivee: sendEmailMutation.isPending,
                            onSelect: () => sendEmailMutation.mutate(inv.id),
                          },
                          inv.status === 'draft' && {
                            cle: 'edit', libelle: t('common.edit'), icone: Pencil,
                            onSelect: () => openEdit(inv),
                          },
                          Number(inv.amountPaid) > 0 && {
                            cle: 'history', libelle: t('invoices.paymentHistory'), icone: History,
                            onSelect: () => setHistoryInvoice(inv),
                          },
                          inv.status === 'cancelled' && {
                            cle: 'reopen', libelle: t('common.reopen'), icone: RotateCcw,
                            onSelect: () => reopenMutation.mutate(inv.id),
                          },
                          ['draft', 'sent'].includes(inv.status) && {
                            cle: 'cancel', libelle: t('common.cancel'), icone: XCircle, danger: true,
                            onSelect: () => cancelMutation.mutate(inv.id),
                          },
                          inv.status === 'cancelled' && {
                            cle: 'delete', libelle: t('common.delete'), icone: Trash2, danger: true,
                            onSelect: () => deleteMutation.mutate(inv.id),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}

      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('invoices.new')} size="xl">
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.customer')} *</label>
              <select className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm" {...register('customerId')}>
                <option value="">{t('common.select')}</option>
                {customers?.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {errors.customerId && <p className="text-xs text-destructive">{t('errors.required')}</p>}
              {/* Sans cette mention, un prix différent du catalogue paraîtrait
                  arbitraire. */}
              {priceListName && (
                <p className="text-xs text-primary">{t('priceLists.applied', { name: priceListName })}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.invoiceDate')} *</label>
              <Input type="date" {...register('invoiceDate')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('invoices.dueDate')} *</label>
              <Input type="date" {...register('dueDate')} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('invoices.paymentMode')}</label>
            <Select {...register('paymentMode')}>
              {MODES_REGLEMENT.map((m) => (
                <option key={m} value={m}>{t(`invoices.methods.${m}`)}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">{t('invoices.paymentModeHint')}</p>
          </div>

          <div className="space-y-2">
            <BandeauScan onScan={scan.traiter} enCours={scan.enCours} dernier={scan.dernier} />
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t('common.items')}</label>
              <Button type="button" size="sm" variant="outline" onClick={() => append({ finishedProductId: '', quantity: 1, unit: 'unité', unitPrice: 0, taxRate1: String(defaultTaxRate) as any })}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-[2fr_70px_60px_100px_130px_110px_32px] gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground">{t('common.product')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('common.qty')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('products.unit')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('purchases.unitPrice')}</span>
              <span className="text-xs font-medium text-muted-foreground">{t('settings.taxRate')}</span>
              <span className="text-xs font-medium text-muted-foreground text-right">TTC</span>
            </div>
            {fields.map((field, i) => {
              const selId = watchInv(`items.${i}.finishedProductId`);
              const selProd = productList.find((p: any) => p.id === selId);
              const lineHT = (Number(watchInv(`items.${i}.quantity`)) || 0) * (Number(watchInv(`items.${i}.unitPrice`)) || 0);
              const lineTaxRate = Number(watchInv(`items.${i}.taxRate1`)) || 0;
              const lineTTC = lineHT * (1 + lineTaxRate / 100);
              return (
                <div key={field.id} className="grid grid-cols-[2fr_70px_60px_100px_130px_110px_32px] gap-2 items-center">
                  <select className="w-full rounded-md border border-input bg-surface px-2 py-1.5 text-sm"
                    {...register(`items.${i}.finishedProductId`)}
                    onChange={e => {
                      setInvValue(`items.${i}.finishedProductId`, e.target.value);
                      const prod = productList.find((p: any) => p.id === e.target.value);
                      if (prod?.unit) setInvValue(`items.${i}.unit`, prod.unit);
                      // Prix de la grille du client si elle en donne un,
                      // sinon tarif de base. Reste modifiable sur la ligne.
                      const prixPropose = prod ? priceFor(prod) : undefined;
                      if (prixPropose != null) setInvValue(`items.${i}.unitPrice`, prixPropose);
                    }}>
                    <option value="">{t('common.select')}</option>
                    {productList.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Input type="number" step="0.01" placeholder={t('common.qty')} {...register(`items.${i}.quantity`)} className="text-xs" />
                  <span className="text-xs px-2 py-1.5 rounded-md border border-input bg-muted text-muted-foreground text-center truncate">
                    {selProd?.unit ?? watchInv(`items.${i}.unit`) ?? '—'}
                  </span>
                  <input type="hidden" {...register(`items.${i}.unit`)} />
                  <Input type="number" step="0.01" placeholder="P.U. HT" {...register(`items.${i}.unitPrice`)} className="text-xs" />
                  <select className="w-full rounded-md border border-input bg-surface px-1 py-1.5 text-xs" {...register(`items.${i}.taxRate1`)}>
                    {taxRates.length > 0
                      ? taxRates.map(r => { const v = String(parseFloat(String(r.rate))); return <option key={v} value={v}>{v}%</option>; })
                      : <option value="19">19%</option>
                    }
                  </select>
                  <span className="text-xs font-medium text-foreground text-right whitespace-nowrap block">{formatCurrency(lineTTC)}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} disabled={fields.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {/* Totals summary */}
            {(() => {
              const watchedItems = watchInv('items') ?? [];
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

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('common.notes')}</label>
            <Input {...register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!paymentInvoice}
        onClose={() => { setPaymentInvoice(null); paymentForm.reset({ paymentDate: today, paymentMethod: 'bank_transfer' }); }}
        title={t('invoices.addPayment')}
      >
        {paymentInvoice && (
          <form onSubmit={paymentForm.handleSubmit(d => paymentMutation.mutate(d))} className="space-y-4">
            <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">{t('invoices.number')} :</span> <span className="font-mono font-medium">{paymentInvoice.invoiceNumber}</span></p>
              <p><span className="text-muted-foreground">{t('invoices.amount')} :</span> <span className="font-medium">{formatCurrency(paymentInvoice.totalAmount)}</span></p>
              <p><span className="text-muted-foreground">{t('invoices.due')} :</span> <span className="font-medium text-destructive">{formatCurrency(paymentInvoice.amountDue)}</span></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentAmount')} *</label>
                <Input type="number" step="0.01" min="0.01" {...paymentForm.register('amount')} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentDate')} *</label>
                <Input type="date" {...paymentForm.register('paymentDate')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentMethod')} *</label>
                <Select {...paymentForm.register('paymentMethod')} className="w-full">
                  <option value="bank_transfer">{t('invoices.methods.bank_transfer')}</option>
                  <option value="cheque">{t('invoices.methods.cheque')}</option>
                  <option value="cash">{t('invoices.methods.cash')}</option>
                  <option value="other">{t('invoices.methods.other')}</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('invoices.paymentReference')}</label>
                <Input placeholder={t('invoices.referencePlaceholder')} {...paymentForm.register('reference')} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('common.notes')}</label>
              <Input {...paymentForm.register('notes')} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline"
                onClick={() => { setPaymentInvoice(null); paymentForm.reset({ paymentDate: today, paymentMethod: 'bank_transfer' }); }}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? <LoadingSpinner size="sm" /> : t('invoices.recordPayment')}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!historyInvoice}
        onClose={() => setHistoryInvoice(null)}
        title={t('invoices.paymentHistory')}
        size="lg"
      >
        {historyInvoice && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted px-4 py-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">{t('invoices.number')} :</span> <span className="font-mono font-medium">{historyInvoice.invoiceNumber}</span></p>
              <p><span className="text-muted-foreground">{t('invoices.amount')} :</span> <span className="font-medium">{formatCurrency(historyInvoice.totalAmount)}</span></p>
              <p><span className="text-muted-foreground">{t('invoices.due')} :</span> <span className="font-medium text-destructive">{formatCurrency(historyInvoice.amountDue)}</span></p>
            </div>

            {paymentsLoading && <LoadingSpinner />}

            {!paymentsLoading && (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.paymentDate')}</th>
                    <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.paymentMethod')}</th>
                    <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.paymentReference')}</th>
                    <th className="px-3 py-2.5 text-right font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('invoices.paymentAmount')}</th>
                    <th className="px-3 py-2.5 text-right font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {paymentsData?.data?.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-2 text-muted-foreground"><EtatVide /></td></tr>
                    )}
                    {paymentsData?.data?.map((p: any) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2.5 text-muted-foreground">{formatDate(p.paymentDate)}</td>
                        <td className="px-3 py-2.5 text-foreground">{t(`invoices.methods.${p.paymentMethod}`)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{p.reference || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-foreground whitespace-nowrap tabular-nums">{formatCurrency(p.amount)}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                          <Button variant="ghost" size="icon" title={t('invoices.cancelPayment')}
                            disabled={removePaymentMutation.isPending}
                            onClick={() => removePaymentMutation.mutate(p.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setHistoryInvoice(null)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
