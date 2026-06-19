import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { customersApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Pagination } from '@/components/shared/Pagination';
import { useToast } from '@/components/ui/Toast';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';

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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [contactsCustomer, setContactsCustomer] = useState<any>(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search],
    queryFn: () => customersApi.list({ page, limit: 20, search: search || undefined }),
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
    onError: () => toast(t('errors.generic'), 'error'),
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
  function openEdit(c: any) { setEditing(c); reset(c); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); reset({}); }

  function openContacts(c: any) { setContactsCustomer(c); }
  function openAddContact() { setEditingContact(null); contactForm.reset({}); setContactModalOpen(true); }
  function openEditContact(ct: any) { setEditingContact(ct); contactForm.reset(ct); setContactModalOpen(true); }

  const contacts = contactsData?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('customers.title')}</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> {t('customers.new')}
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t('common.search')} value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('customers.name')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('customers.nif')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('customers.rc')}</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('customers.phone')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.data?.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {data?.data?.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{c.nif || '—'}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{c.rc || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('customers.contacts')} onClick={() => openContacts(c)}>
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}>
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
