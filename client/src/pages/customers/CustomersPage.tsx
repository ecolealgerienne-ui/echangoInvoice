import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { useSort } from '@/hooks/useSort';
import { EnteteTriable } from '@/components/shared/EnteteTriable';
import { ColumnToggleMenu } from '@/components/shared/ColumnToggleMenu';
import { ExportButton } from '@/components/shared/ExportButton';
import { EtatVide } from '@/components/shared/EtatVide';
import { EnTetePage } from '@/components/shared/EnTetePage';
import { Avatar } from '@/components/shared/Avatar';
import { MenuActions } from '@/components/shared/MenuActions';

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
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [contactsCustomer, setContactsCustomer] = useState<any>(null);
  // L'union couvre toutes les colonnes du menu : « email » et « city » sont
  // masquées par défaut mais restent activables.
  const { visible, toggle, col } = useColumnVisibility<
    'name' | 'nif' | 'rc' | 'phone' | 'email' | 'city'
  >(
    'customers_visible_columns',
    ['name', 'nif', 'rc', 'phone'],
  );
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search, tri],
    queryFn: () => customersApi.list({ ...tri, page, limit: 20, search: search || undefined }),
  });

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
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('customers.new')}
        </Button>
      </EnTetePage>

      <div className="flex items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ExportButton dataset="clients" />
          <ColumnToggleMenu
            columns={[
              { key: 'name', label: t('customers.name') },
              { key: 'nif', label: t('customers.nif') },
              { key: 'rc', label: t('customers.rc') },
              { key: 'phone', label: t('customers.phone') },
              { key: 'email', label: t('customers.email') },
              { key: 'city', label: t('customers.city') },
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
                {col('name') && (
                  <EnteteTriable libelle={t('customers.name')} colonne="name" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('nif') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('customers.nif')}</th>}
                {col('rc') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('customers.rc')}</th>}
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
                <th className="px-3 py-2.5 text-right font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-2 text-muted-foreground"><EtatVide /></td></tr>
              )}
              {data?.data?.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  {/* La pastille prend le rôle de repère et rend au nom celui
                      d'identité : sans elle, vingt lignes qui commencent toutes
                      par « EURL » se relisent mot à mot. */}
                  {col('name') && (
                    <td className="px-3 py-2.5 font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar nom={c.name} />
                        <Link to={`/customers/${c.id}`} className="min-w-0 truncate text-primary hover:underline">
                          {c.name}
                        </Link>
                      </div>
                    </td>
                  )}
                  {col('nif') && <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.nif || '—'}</td>}
                  {col('rc') && <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.rc || '—'}</td>}
                  {col('phone') && <td className="px-3 py-2.5 text-muted-foreground">{c.phone || '—'}</td>}
                  {col('email') && <td className="px-3 py-2.5 text-muted-foreground">{c.email || '—'}</td>}
                  {col('city') && <td className="px-3 py-2.5 text-muted-foreground">{c.city || '—'}</td>}
                  {/* Aucune des trois actions ne domine — on ne consulte pas
                      les contacts d'un client dix fois par jour — donc aucune
                      ne reste dehors. */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
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
        </div>
      )}

      {data?.pagination && (
        <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />
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
