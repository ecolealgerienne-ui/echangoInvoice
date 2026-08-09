import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { customersApi, priceListsApi, resolveApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import {
  Plus, Pencil, Trash2, Search, Users, ListFilter, TrendingDown, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ecartPourcent, montantAbrege } from '@/lib/montants';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { useSort } from '@/hooks/useSort';
import { EnteteTriable } from '@/components/shared/EnteteTriable';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';
import { EtatVide } from '@/components/shared/EtatVide';
import { EnTetePage } from '@/components/shared/EnTetePage';
import { Avatar } from '@/components/shared/Avatar';
import { MenuActions } from '@/components/shared/MenuActions';
import { TableConteneur } from '@/components/ui/DataTable';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  shippingAddress: z.string().optional(),
  shippingCity: z.string().optional(),
  nif: z.string().optional(),
  rc: z.string().optional(),
  ai: z.string().optional(),
  nis: z.string().optional(),
  isCustomer: z.boolean().optional(),
  isSupplier: z.boolean().optional(),
  // Chaîne vide = pas de grille. Le DTO la ramène à null côté serveur.
  priceListId: z.string().optional(),
});

const contactSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;
type ContactFormData = z.infer<typeof contactSchema>;

export function CustomersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Colonnes triables = liste blanche du service ; toute autre rend un 400.
  const { tri, trierPar, ariaSort } = useSort<'name' | 'city' | 'phone' | 'email' | 'createdAt'>(
    'customers_sort', { sortBy: 'name', sortOrder: 'ASC' },
  );
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  // Les trois filtres de la maquette. Chacun part au serveur : un filtre qui
  // trierait la page déjà reçue mentirait sur le total affiché en tête, et sur
  // la pagination.
  const [ville, setVille] = useState('');
  const [type, setType] = useState('');
  const [statut, setStatut] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [contactsCustomer, setContactsCustomer] = useState<any>(null);
  // La clé d'enregistrement porte un « v2 » : quatre colonnes ont été ajoutées,
  // et la liste gardée sur les postes existants les aurait toutes masquées —
  // l'écran serait arrivé sans son chiffre d'affaires ni son statut, ce que
  // personne n'aurait su rétablir sans ouvrir le menu des colonnes.
  const { visible, toggle, col } = useColumnVisibility<
    'name' | 'nif' | 'rc' | 'phone' | 'email' | 'city' | 'revenue' | 'status'
  >(
    // « v3 » : le RC sort de la vue par defaut. Huit colonnes plus les
    // actions ne tiennent pas sur un portable, et c'est la colonne d'etat qui
    // passait sous la colonne collante — « Acti… » au lieu de « Actif ». Le RC
    // se consulte sur la fiche, rarement en balayant une liste ; il reste a un
    // clic dans le menu des colonnes.
    'customers_visible_columns_v3',
    ['name', 'nif', 'phone', 'email', 'city', 'revenue', 'status'],
  );
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);

  const filtresActifs = Boolean(ville || type || statut);
  function reinitialiserFiltres() {
    setVille(''); setType(''); setStatut(''); setPage(1);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, limit, search, ville, type, statut, tri],
    queryFn: () => customersApi.list({
      ...tri,
      page,
      limit,
      search: search || undefined,
      city: ville || undefined,
      type: type || undefined,
      // Envoyé en chaîne, et seulement quand un statut est choisi : le DTO le
      // ramène au booléen, et un paramètre absent doit le rester pour que la
      // liste ne se réduise pas d'elle-même aux clients actifs.
      isActive: statut || undefined,
    }),
  });

  // Les villes réellement présentes chez ce locataire, pas les quarante-huit
  // wilayas : une liste déroulante dont quarante entrées ne rendent rien est
  // pire qu'un champ libre.
  const { data: villesData } = useQuery({
    queryKey: ['customers-cities'],
    queryFn: () => customersApi.cities(),
    staleTime: 5 * 60 * 1000,
  });
  const villes: string[] = villesData?.data ?? [];

  const { data: priceLists } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => priceListsApi.list(),
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['customer-contacts', contactsCustomer?.id],
    queryFn: () => customersApi.listContacts(contactsCustomer.id),
    enabled: !!contactsCustomer,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const contactForm = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const mutation = useMutation({
    mutationFn: (d: FormData) =>
      editing ? customersApi.update(editing.id, d) : customersApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast(t('common.save') + ' !', 'success');
      closeModal();
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast(t('common.deleted'), 'success');
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  const contactMutation = useMutation({
    mutationFn: (d: ContactFormData) =>
      editingContact
        ? customersApi.updateContact(contactsCustomer.id, editingContact.id, d)
        : customersApi.createContact(contactsCustomer.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-contacts', contactsCustomer?.id] });
      toast(t('common.save') + ' !', 'success');
      setContactModalOpen(false);
      setEditingContact(null);
      contactForm.reset({});
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteContactMutation = useMutation({
    mutationFn: ({ customerId, contactId }: { customerId: string; contactId: string }) =>
      customersApi.removeContact(customerId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-contacts', contactsCustomer?.id] });
      toast(t('common.deleted'), 'success');
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  function openCreate() { setEditing(null); reset({}); setModalOpen(true); }

  /**
   * `?nouveau=1` ouvre le formulaire de création à l'arrivée.
   *
   * C'est ce qui donne un sens au menu « + Nouveau » du tableau de bord : sans
   * lui, l'entrée « Nouveau client » n'aurait fait qu'amener sur la liste, en
   * laissant chercher le bouton — un raccourci qui ne raccourcit rien.
   *
   * Le paramètre est retiré de l'URL aussitôt lu, sinon un rafraîchissement de
   * page rouvrirait la modale sans qu'on l'ait demandé.
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
  function openEdit(c: any) {
    setEditing(c);
    // priceListId vaut null quand le client est au tarif de base ; un <select>
    // attend une chaîne, sinon React le traite comme non contrôlé.
    reset({ ...c, priceListId: c.priceListId ?? '' });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); reset({}); }

  function openContacts(c: any) { setContactsCustomer(c); }
  function openAddContact() { setEditingContact(null); contactForm.reset({}); setContactModalOpen(true); }
  function openEditContact(ct: any) { setEditingContact(ct); contactForm.reset(ct); setContactModalOpen(true); }

  const contacts = contactsData?.data ?? [];

  return (
    <div className="space-y-5">
      <EnTetePage titre={t('customers.title')} total={data?.pagination?.total} cleTotal="customers.totalCount">
        <div className="flex items-center gap-2">
          <ExportButton dataset="clients" />
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" /> {t('customers.new')}
          </Button>
        </div>
      </EnTetePage>

      {/* ── Recherche et filtres ─────────────────────────────────────────────
          Le champ de recherche annonce ce sur quoi il porte. « Rechercher »
          seul laissait deviner : on y tapait un numéro de téléphone sans savoir
          s'il serait lu, et le serveur ne cherchait alors ni dans le NIF ni
          dans le RC — il le fait désormais, et le champ le dit. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            placeholder={t('customers.rechercherPlaceholder')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="ps-9"
          />
        </div>

        {/* « Filtres » nomme la rangée ; ce n'est pas un bouton. Un bouton qui
            n'ouvre rien — les listes sont déjà là, à côté — serait un décor, et
            le premier clic dessus apprendrait qu'il ne sert à rien. */}
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm text-muted-foreground">
          <ListFilter className="h-4 w-4" aria-hidden />
          {t('customers.filtres.titre')}
        </span>

        <Select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          aria-label={t('customers.filtres.type')}
          className="h-9 w-auto min-w-36"
        >
          <option value="">{t('customers.filtres.type')}</option>
          {/* Les deux seules natures qui existent en base : la liste ne rend
              que des clients, la question est donc « aussi fournisseur ? ». */}
          <option value="customer">{t('customers.filtres.typeClient')}</option>
          <option value="both">{t('customers.filtres.typeMixte')}</option>
        </Select>

        <Select
          value={ville}
          onChange={(e) => { setVille(e.target.value); setPage(1); }}
          aria-label={t('customers.city')}
          className="h-9 w-auto min-w-36"
        >
          <option value="">{t('customers.city')}</option>
          {villes.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>

        <Select
          value={statut}
          onChange={(e) => { setStatut(e.target.value); setPage(1); }}
          aria-label={t('common.status')}
          className="h-9 w-auto min-w-32"
        >
          <option value="">{t('common.status')}</option>
          <option value="true">{t('common.active')}</option>
          <option value="false">{t('common.inactive')}</option>
        </Select>

        {/* Il n'apparaît que lorsqu'il a quelque chose à faire. */}
        {filtresActifs && (
          <Button variant="ghost" size="sm" onClick={reinitialiserFiltres}>
            {t('customers.filtres.reinitialiser')}
          </Button>
        )}

        <div className="ms-auto">
          <ColumnToggleMenu
            columns={[
              { key: 'name', label: t('customers.name') },
              { key: 'nif', label: t('customers.nif') },
              { key: 'rc', label: t('customers.rc') },
              { key: 'phone', label: t('customers.phone') },
              { key: 'email', label: t('customers.email') },
              { key: 'city', label: t('customers.city') },
              { key: 'revenue', label: t('customers.caCeMois') },
              { key: 'status', label: t('common.status') },
            ]}
            visible={visible}
            onToggle={toggle}
          />
        </div>
      </div>

      {/* Le tableau déborde plutôt qu'il ne replie : neuf colonnes ne tiennent
          pas toujours dans la fenêtre, et une adresse de courrier coupée en
          trois lignes transforme chaque ligne en pavé. Un défilement horizontal
          se comprend ; un tableau qui se replie ne se lit plus. */}
      {isLoading ? <LoadingSpinner /> : (
        <TableConteneur>
          <table className="w-full min-w-[64rem] whitespace-nowrap text-sm">
            <thead>
              <tr>
                {col('name') && (
                  <EnteteTriable libelle={t('customers.name')} colonne="name" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('nif') && <th className="px-3 py-2.5 text-left">{t('customers.nif')}</th>}
                {col('rc') && <th className="px-3 py-2.5 text-left">{t('customers.rc')}</th>}
                {col('phone') && (
                  <EnteteTriable libelle={t('customers.phone')} colonne="phone" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('email') && (
                  <EnteteTriable libelle={t('customers.email')} colonne="email" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('city') && (
                  <EnteteTriable libelle={t('customers.city')} colonne="city" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {/* Le chiffre d'affaires n'est pas triable : il est agrégé
                    après la page, sur les seules lignes déjà lues. Un en-tête
                    cliquable trierait vingt lignes sur mille deux cents, ce qui
                    est faux — mieux vaut ne rien promettre. */}
                {col('revenue') && (
                  <th className="px-3 py-2.5 text-right">
                    {t('customers.caCeMois')}
                  </th>
                )}
                {col('status') && (
                  <th className="px-3 py-2.5 text-left">
                    {t('common.status')}
                  </th>
                )}
                <th className="sticky right-0 z-10 bg-surface px-3 py-2.5 text-right [box-shadow:-1px_0_0_0_oklch(var(--ci-border))]">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-2 text-muted-foreground"><EtatVide /></td></tr>
              )}
              {data?.data?.map((c: any) => (
                <tr key={c.id} className="group/ligne hover:bg-surface-hover transition-colors">
                  {/* La pastille prend le rôle de repère et rend au nom celui
                      d'identité : sans elle, vingt lignes qui commencent toutes
                      par « EURL » se relisent mot à mot. */}
                  {col('name') && (
                    <td className="px-3 py-2.5 font-medium">
                      <div className="flex max-w-[15rem] items-center gap-2.5">
                        <Avatar nom={c.name} />
                        <Link
                          to={`/customers/${c.id}`}
                          title={c.name}
                          className="text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                      </div>
                    </td>
                  )}
                  {col('nif') && <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.nif || '—'}</td>}
                  {col('rc') && <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.rc || '—'}</td>}
                  {col('phone') && <td className="px-3 py-2.5 text-muted-foreground">{c.phone || '—'}</td>}
                  {/* L'adresse est coupée à treize rem plutôt que repliée : sur
                      trois cents lignes, une seule adresse longue suffit à
                      épaissir toute la colonne. Le survol rend l'adresse
                      entière, et la fiche du client la porte en clair. */}
                  {col('email') && (
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <div className="max-w-[13rem] truncate" title={c.email || undefined}>
                        {c.email || '—'}
                      </div>
                    </td>
                  )}
                  {col('city') && <td className="px-3 py-2.5 text-muted-foreground">{c.city || '—'}</td>}
                  {/* Le montant est abrégé, contrairement à la règle qui
                      réserve `montantAbrege` aux cartes : ce n'est pas un solde
                      qu'on rapproche d'un virement, c'est un ordre de grandeur
                      qu'on compare d'une ligne à l'autre. Écrit en entier, il
                      tiendrait la moitié du tableau. Le montant exact reste au
                      survol, et sur la fiche du client. */}
                  {col('revenue') && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="font-medium text-foreground">
                          {montantAbrege(c.revenueThisMonth ?? 0, 2)}
                        </span>
                        {c.revenueEvolution != null && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 text-2xs font-semibold',
                              c.revenueEvolution >= 0 ? 'text-success-text' : 'text-destructive-text',
                            )}
                          >
                            {c.revenueEvolution >= 0
                              ? <TrendingUp className="h-2.5 w-2.5" aria-hidden />
                              : <TrendingDown className="h-2.5 w-2.5" aria-hidden />}
                            {ecartPourcent(c.revenueEvolution)}
                          </span>
                        )}
                      </span>
                    </td>
                  )}
                  {col('status') && (
                    <td className="px-3 py-2.5">
                      <Badge point variant={c.isActive ? 'success' : 'muted'}>
                        {t(c.isActive ? 'common.active' : 'common.inactive')}
                      </Badge>
                    </td>
                  )}
                  {/* Aucune des trois actions ne domine — on ne consulte pas
                      les contacts d'un client dix fois par jour — donc aucune
                      ne reste dehors. */}
                  <td className="sticky right-0 z-10 bg-surface px-3 py-2.5 text-right whitespace-nowrap tabular-nums [box-shadow:-1px_0_0_0_oklch(var(--ci-border))] group-hover/ligne:bg-surface-hover">
                    <div className="flex justify-end">
                      <MenuActions
                        actions={[
                          { cle: 'contacts', libelle: t('customers.contacts'), icone: Users, onSelect: () => openContacts(c) },
                          { cle: 'edit', libelle: t('common.edit'), icone: Pencil, onSelect: () => openEdit(c) },
                          { cle: 'delete', libelle: t('common.delete'), icone: Trash2, danger: true, onSelect: () => deleteMutation.mutate(c.id) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableConteneur>
      )}

      {data?.pagination && (
        <Pagination
          page={page}
          total={data.pagination.total}
          limit={data.pagination.limit}
          onChange={setPage}
          // Le retour à la première page est indispensable : passer de 100 à 10
          // par page depuis la page 7 demanderait au serveur des lignes 601 à
          // 610 d'une liste qui n'en compte plus que 130.
          onLimitChange={(n) => { setLimit(n); setPage(1); }}
        />
      )}

      {/* Create/Edit customer modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('customers.new')}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('customers.name')} *</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('isCustomer')} defaultChecked className="rounded" />
              {t('partners.isCustomer')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('isSupplier')} className="rounded" />
              {t('partners.isSupplier')}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('customers.email')}</label>
              <Input type="email" {...register('email')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('customers.phone')}</label>
              <Input {...register('phone')} />
            </div>
          </div>

          {/* Identification fiscale */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('customers.legalInfo')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('customers.nif')}</label>
                <Input {...register('nif')} placeholder="000000000000000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('customers.rc')}</label>
                <Input {...register('rc')} placeholder="00/00-0000000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('customers.ai')}</label>
                <Input {...register('ai')} placeholder="00000000000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('customers.nis')}</label>
                <Input {...register('nis')} placeholder="000000000000000" />
              </div>
            </div>
          </div>

          {/* Adresse principale */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('customers.billingAddress')}</p>
            <div className="space-y-2">
              <Input {...register('address')} placeholder={t('customers.address')} />
              <div className="grid grid-cols-2 gap-3">
                <Input {...register('city')} placeholder={t('customers.city')} />
                <Input {...register('country')} placeholder={t('customers.country')} />
              </div>
            </div>
          </div>

          {/* Tarification */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('priceLists.title')}</p>
            <Select {...register('priceListId')} className="w-full">
              <option value="">{t('priceLists.basePriceOption')}</option>
              {priceLists?.data?.filter((g: any) => g.isActive).map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground mt-1">{t('priceLists.customerHint')}</p>
          </div>

          {/* Adresse de livraison */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('customers.shippingAddress')}</p>
            <div className="space-y-2">
              <Input {...register('shippingAddress')} placeholder={t('customers.address')} />
              <Input {...register('shippingCity')} placeholder={t('customers.city')} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      {/* Contacts panel */}
      <Modal
        open={!!contactsCustomer}
        onClose={() => setContactsCustomer(null)}
        title={contactsCustomer ? `${t('customers.contacts')} — ${contactsCustomer.name}` : ''}
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openAddContact}>
              <Plus className="h-4 w-4 mr-1" />{t('customers.addContact')}
            </Button>
          </div>

          {contactsLoading ? <LoadingSpinner /> : (
            contacts.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((ct: any) => (
                  <div key={ct.id} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                    <div>
                      <p className="font-medium text-sm">
                        {ct.name}
                        {ct.isPrimary && <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{t('customers.primary')}</span>}
                      </p>
                      {ct.role && <p className="text-xs text-muted-foreground">{ct.role}</p>}
                      <p className="text-xs text-muted-foreground">{[ct.email, ct.phone].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditContact(ct)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => deleteContactMutation.mutate({ customerId: contactsCustomer.id, contactId: ct.id })}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </Modal>

      {/* Add/edit contact modal */}
      <Modal
        open={contactModalOpen}
        onClose={() => { setContactModalOpen(false); setEditingContact(null); contactForm.reset({}); }}
        title={editingContact ? t('common.edit') : t('customers.addContact')}
      >
        <form onSubmit={contactForm.handleSubmit(d => contactMutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('customers.name')} *</label>
            <Input {...contactForm.register('name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('customers.contactRole')}</label>
              <Input {...contactForm.register('role')} placeholder="Directeur, Comptable..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('customers.phone')}</label>
              <Input {...contactForm.register('phone')} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('customers.email')}</label>
            <Input type="email" {...contactForm.register('email')} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...contactForm.register('isPrimary')} className="rounded" />
            {t('customers.primary')}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline"
              onClick={() => { setContactModalOpen(false); setEditingContact(null); contactForm.reset({}); }}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={contactMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
