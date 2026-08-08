import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customersApi } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { libelleMode } from '@/lib/modesReglement';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Bloc, Champ, DocumentEnTete } from '@/components/shared/DocumentView';
import { Chiffres, Historique } from '@/components/shared/Historique';


export function CustomerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/customers" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('customers.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.customer_not_found')}</p>
      </div>
    );
  }

  const client = data.data;
  const s = client.stats;

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/customers"
        retourLibelle={t('customers.title')}
        titre={client.name}
        statut={{
          libelle: client.isActive ? t('common.active') : t('common.inactive'),
          variant: client.isActive ? 'success' : 'secondary',
        }}
      />

      {/* L'encours en tête, et le retard en rouge : c'est le chiffre depuis
          lequel on décide d'appeler le client. Le CA seul ne dit rien. */}
      <Chiffres
        items={[
          { libelle: t('partners.detail.turnover'), montant: s.chiffreAffaires },
          { libelle: t('partners.detail.collected'), montant: s.encaisse },
          { libelle: t('partners.detail.outstanding'), montant: s.encours },
          { libelle: t('partners.detail.overdue'), montant: s.enRetard, alerte: true },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('partners.detail.contact')}>
          <Champ libelle={t('customers.contactPerson')} valeur={client.contactPerson} />
          <Champ libelle={t('customers.phone')} valeur={client.phone} />
          <Champ libelle={t('customers.email')} valeur={client.email} />
          <Champ libelle={t('customers.address')} valeur={client.address} />
          <Champ libelle={t('customers.city')} valeur={client.city} />
        </Bloc>

        <Bloc titre={t('partners.detail.legal')}>
          <Champ libelle={t('customers.nif')} valeur={client.nif} />
          <Champ libelle={t('customers.rc')} valeur={client.rc} />
          <Champ libelle={t('customers.ai')} valeur={client.ai} />
          <Champ libelle={t('customers.nis')} valeur={client.nis} />
          {/* La grille explique pourquoi ce client ne paie pas le tarif du
              catalogue — sinon un prix différent paraît arbitraire. */}
          <Champ
            libelle={t('partners.detail.priceList')}
            valeur={client.priceListName ?? t('partners.detail.basePrice')}
          />
          <Champ libelle={t('common.notes')} valeur={client.notes} />
        </Bloc>
      </div>

      <Historique
        titre={`${t('invoices.title')} (${s.nbFactures})`}
        lignes={client.history.invoices}
        vide={t('partners.detail.noInvoice')}
        colonnes={[
          {
            entete: t('invoices.number'),
            rendu: (f: any) => (
              <Link to={`/invoices/${f.id}`} className="font-mono text-primary hover:underline">
                {f.invoiceNumber}
              </Link>
            ),
          },
          { entete: t('common.date'), rendu: (f: any) => formatDate(f.invoiceDate) },
          { entete: t('invoices.dueDate'), rendu: (f: any) => formatDate(f.dueDate) },
          { entete: t('invoices.amount'), rendu: (f: any) => formatCurrency(f.totalAmount), droite: true },
          {
            entete: t('invoices.due'),
            droite: true,
            rendu: (f: any) => (
              <span className={Number(f.amountDue) > 0 ? 'text-destructive' : ''}>
                {formatCurrency(f.amountDue)}
              </span>
            ),
          },
          {
            entete: t('common.status'),
            rendu: (f: any) => (
              <Badge variant={varianteStatut(f.status) as never}>
                {t(`invoices.status.${f.status}`)}
              </Badge>
            ),
          },
        ]}
      />

      <Historique
        titre={t('invoices.detail.payments')}
        lignes={client.history.payments}
        vide={t('partners.detail.noPayment')}
        colonnes={[
          { entete: t('common.date'), rendu: (p: any) => formatDate(p.paymentDate) },
          {
            entete: t('invoices.detail.invoice'),
            rendu: (p: any) => (
              <Link to={`/invoices/${p.invoiceId}`} className="font-mono text-primary hover:underline">
                {p.invoiceNumber}
              </Link>
            ),
          },
          { entete: t('partners.detail.method'), rendu: (p: any) => libelleMode(t, p.paymentMethod) },
          { entete: t('partners.detail.reference'), rendu: (p: any) => p.reference ?? '—' },
          { entete: t('common.amount'), rendu: (p: any) => formatCurrency(p.amount), droite: true },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Historique
          titre={t('deliveries.title')}
          lignes={client.history.deliveryNotes}
          vide={t('partners.detail.noDelivery')}
          colonnes={[
            {
              entete: t('deliveries.blNumber'),
              rendu: (b: any) => (
                <Link to={`/deliveries/${b.id}`} className="font-mono text-primary hover:underline">
                  {b.blNumber}
                </Link>
              ),
            },
            { entete: t('common.date'), rendu: (b: any) => formatDate(b.deliveryDate) },
            { entete: t('common.amount'), rendu: (b: any) => formatCurrency(b.totalAmount), droite: true },
            {
              entete: t('common.status'),
              rendu: (b: any) => (
                <Badge variant={varianteStatut(b.status) as never}>{t(`deliveries.status.${b.status}`)}</Badge>
              ),
            },
          ]}
        />

        <Historique
          titre={t('quotes.title')}
          lignes={client.history.quotes}
          vide={t('partners.detail.noQuote')}
          colonnes={[
            {
              entete: t('quotes.quoteNumber'),
              rendu: (q: any) => (
                <Link to={`/quotes/${q.id}`} className="font-mono text-primary hover:underline">
                  {q.quoteNumber}
                </Link>
              ),
            },
            { entete: t('common.date'), rendu: (q: any) => formatDate(q.quoteDate) },
            { entete: t('common.amount'), rendu: (q: any) => formatCurrency(q.totalAmount), droite: true },
            {
              entete: t('common.status'),
              rendu: (q: any) => (
                <Badge variant={varianteStatut(q.status) as never}>{t(`status.${q.status}`)}</Badge>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
