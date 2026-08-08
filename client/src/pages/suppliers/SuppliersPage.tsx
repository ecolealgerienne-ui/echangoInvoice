import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { suppliersApi, resolveApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  nif: z.string().optional(),
  rc: z.string().optional(),
  ai: z.string().optional(),
  nis: z.string().optional(),
  isCustomer: z.boolean().optional(),
  isSupplier: z.boolean().optional(),
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

export function SuppliersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  // Colonnes triables = liste blanche du service ; toute autre rend un 400.
  const { tri, trierPar, ariaSort } = useSort<'name' | 'city' | 'phone' | 'email' | 'createdAt'>(
    'suppliers_sort', { sortBy: 'name', sortOrder: 'ASC' },
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [contactsSupplier, setContactsSupplier] = useState<any>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);

  const { visible, toggle, col } = useColumnVisibility(
    'suppliers_visible_columns',
    ['name', 'nif', 'rc', 'phone', 'email', 'city'],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search, tri],
    queryFn: () => suppliersApi.list({ ...tri, page, limit: 20, search: search || undefined }),
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['supplier-contacts', contactsSupplier?.id],
    queryFn: () => suppliersApi.listContacts(contactsSupplier.id),
    enabled: !!contactsSupplier,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const contactForm = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const mutation = useMutation({
    mutationFn: (d: FormData) => editing ? suppliersApi.update(editing.id, d) : suppliersApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast(t('common.save') + ' !', 'success');
      closeModal();
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => suppliersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast(t('common.deleted'), 'success');
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const contactMutation = useMutation({
    mutationFn: (d: ContactFormData) =>
      editingContact
        ? suppliersApi.updateContact(contactsSupplier.id, editingContact.id, d)
        : suppliersApi.createContact(contactsSupplier.id, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-contacts', contactsSupplier?.id] });
      toast(t('common.save') + ' !', 'success');
      setContactModalOpen(false);
      setEditingContact(null);
      contactForm.reset({});
    },
    onError: (err) => toast(resolveApiError(err, t), 'error'),
  });

  const deleteContactMutation = useMutation({
    mutationFn: ({ supplierId, contactId }: { supplierId: string; contactId: string }) =>
      suppliersApi.removeContact(supplierId, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-contacts', contactsSupplier?.id] });
      toast(t('common.deleted'), 'success');
    },
    onError: () => toast(t('errors.generic'), 'error'),
  });

  /**
   * L'API renvoie `null` pour les champs texte non renseignés, mais le schéma
   * n'accepte qu'une chaîne, une chaîne vide ou `undefined`. Charger la fiche
   * telle quelle faisait échouer la validation **en silence** : le formulaire
   * refusait la soumission sans qu'aucune requête ne parte. On normalise donc
   * les nuls en chaînes vides, ce qui est aussi ce qu'attend un <input>.
   */
  function normaliser(s: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(s).map(([k, v]) => [k, v === null ? '' : v]),
    );
  }

  function openCreate() { setEditing(null); reset({}); setModalOpen(true); }
  function openEdit(s: any) { setEditing(s); reset(normaliser(s)); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); reset({}); }

  function openContacts(s: any) { setContactsSupplier(s); }
  function openAddContact() { setEditingContact(null); contactForm.reset({}); setContactModalOpen(true); }
  function openEditContact(ct: any) { setEditingContact(ct); contactForm.reset(ct); setContactModalOpen(true); }

  const contacts = contactsData?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('suppliers.title')}</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('suppliers.new')}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('common.search')} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ExportButton dataset="fournisseurs" />
          <ColumnToggleMenu
            columns={[
              { key: 'name', label: t('suppliers.name') },
              { key: 'nif', label: t('suppliers.nif') },
              { key: 'rc', label: t('suppliers.rc') },
              { key: 'phone', label: t('suppliers.phone') },
              { key: 'email', label: t('suppliers.email') },
              { key: 'city', label: t('suppliers.city') },
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
                  <EnteteTriable libelle={t('suppliers.name')} colonne="name" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('nif') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('suppliers.nif')}</th>}
                {col('rc') && <th className="px-3 py-2.5 text-left font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('suppliers.rc')}</th>}
                {col('phone') && (
                  <EnteteTriable libelle={t('suppliers.phone')} colonne="phone" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('email') && (
                  <EnteteTriable libelle={t('suppliers.email')} colonne="email" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                {col('city') && (
                  <EnteteTriable libelle={t('suppliers.city')} colonne="city" tri={tri}
                    onTrier={trierPar} ariaSort={ariaSort} />
                )}
                <th className="px-3 py-2.5 text-right font-medium text-2xs uppercase tracking-wide text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="text-center py-2 text-muted-foreground"><EtatVide /></td></tr>
              )}
              {data?.data?.map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  {col('name') && (
                    <td className="px-3 py-2.5 font-medium">
                      <Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">
                        {s.name}
                      </Link>
                    </td>
                  )}
                  {col('nif') && <td className="px-3 py-2.5 font-mono text-muted-foreground">{s.nif || '—'}</td>}
                  {col('rc') && <td className="px-3 py-2.5 font-mono text-muted-foreground">{s.rc || '—'}</td>}
                  {col('phone') && <td className="px-3 py-2.5 text-muted-foreground">{s.phone || '—'}</td>}
                  {col('email') && <td className="px-3 py-2.5 text-muted-foreground">{s.email || '—'}</td>}
                  {col('city') && <td className="px-3 py-2.5 text-muted-foreground">{s.city || '—'}</td>}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('suppliers.contacts')} onClick={() => openContacts(s)}>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(s.id)}>
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

      {data?.pagination && <Pagination page={page} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} />}

      {/* Create/Edit supplier modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? t('common.edit') : t('suppliers.new')}>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">{t('suppliers.name')} *</label>
            <Input {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{t('errors.required')}</p>}
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('isSupplier')} defaultChecked className="rounded" />
              {t('partners.isSupplier')}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('isCustomer')} className="rounded" />
              {t('partners.isCustomer')}
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('suppliers.email')}</label>
              <Input type="email" {...register('email')} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{t('suppliers.phone')}</label>
              <Input {...register('phone')} />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('suppliers.legalInfo')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('suppliers.nif')}</label>
                <Input {...register('nif')} placeholder="000000000000000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('suppliers.rc')}</label>
                <Input {...register('rc')} placeholder="00/00-0000000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('suppliers.ai')}</label>
                <Input {...register('ai')} placeholder="00000000000" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{t('suppliers.nis')}</label>
                <Input {...register('nis')} placeholder="000000000000000" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('suppliers.address')}</p>
            <div className="space-y-2">
              <Input {...register('address')} placeholder={t('suppliers.addressLine')} />
              <div className="grid grid-cols-2 gap-3">
                <Input {...register('city')} placeholder={t('suppliers.city')} />
                <Input {...register('country')} placeholder={t('suppliers.country')} />
              </div>
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
        open={!!contactsSupplier}
        onClose={() => setContactsSupplier(null)}
        title={contactsSupplier ? `${t('suppliers.contacts')} — ${contactsSupplier.name}` : ''}
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openAddContact}>
              <Plus className="h-4 w-4 mr-1" />{t('suppliers.addContact')}
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
                        {ct.isPrimary && <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{t('suppliers.primary')}</span>}
                      </p>
                      {ct.role && <p className="text-xs text-muted-foreground">{ct.role}</p>}
                      <p className="text-xs text-muted-foreground">{[ct.email, ct.phone].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditContact(ct)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        onClick={() => deleteContactMutation.mutate({ supplierId: contactsSupplier.id, contactId: ct.id })}>
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
        title={editingContact ? t('common.edit') : t('suppliers.addContact')}
      >
        <form onSubmit={contactForm.handleSubmit(d => contactMutation.mutate(d))} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('suppliers.name')} *</label>
            <Input {...contactForm.register('name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('suppliers.contactRole')}</label>
              <Input {...contactForm.register('role')} placeholder="Directeur, Comptable..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('suppliers.phone')}</label>
              <Input {...contactForm.register('phone')} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">{t('suppliers.email')}</label>
            <Input type="email" {...contactForm.register('email')} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...contactForm.register('isPrimary')} className="rounded" />
            {t('suppliers.primary')}
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
