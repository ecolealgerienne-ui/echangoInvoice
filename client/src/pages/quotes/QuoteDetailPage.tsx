import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { quotesApi } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { enregistrerBlob } from '@/lib/download';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import {
  Bloc, Champ, ChampLien, DocumentEnTete, LignesDocument, Totaux,
} from '@/components/shared/DocumentView';


export function QuoteDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/quotes" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('quotes.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.quote_not_found')}</p>
      </div>
    );
  }

  const devis = data.data;
  const client = devis.customer;

  function telechargerPdf() {
    quotesApi.pdf(id!)
      .then((blob: Blob) => enregistrerBlob(blob, `${devis.quoteNumber}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/quotes"
        retourLibelle={t('quotes.title')}
        titre={devis.quoteNumber}
        statut={{
          libelle: t(`status.${devis.status}`),
          variant: varianteStatut(devis.status),
        }}
        actions={
          <Button variant="outline" size="sm" onClick={telechargerPdf}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('common.customer')}>
          {client ? (
            <Link to={`/customers/${client.id}`} className="text-sm font-medium text-primary hover:underline">
              {client.name}
            </Link>
          ) : <p className="text-sm text-muted-foreground">—</p>}
          <Champ libelle={t('customers.nif')} valeur={client?.nif} />
          <Champ libelle={t('customers.address')} valeur={client?.address} />
          <Champ libelle={t('customers.city')} valeur={client?.city} />
          <Champ libelle={t('customers.phone')} valeur={client?.phone} />
        </Bloc>

        <Bloc titre={t('invoices.detail.document')}>
          <Champ libelle={t('quotes.quoteDate')} valeur={formatDate(devis.quoteDate)} />
          <Champ libelle={t('quotes.expiryDate')} valeur={formatDate(devis.expiryDate)} />
          {/* Un devis converti a une suite : sans ces deux champs, rien ne dit
              en quoi il s'est transformé, et le statut « Converti » reste une
              information sans objet. */}
          <ChampLien
            libelle={t('invoices.detail.invoice')}
            valeur={devis.invoiceNumber}
            vers={devis.convertedToInvoiceId ? `/invoices/${devis.convertedToInvoiceId}` : null}
          />
          <ChampLien
            libelle={t('deliveries.blNumber')}
            valeur={devis.blNumber}
            vers={devis.convertedToDeliveryNoteId
              ? `/deliveries/${devis.convertedToDeliveryNoteId}` : null}
          />
          <Champ libelle={t('common.notes')} valeur={devis.notes} />
        </Bloc>
      </div>

      <LignesDocument
        lignes={devis.items ?? []}
        libelles={{
          article: t('invoices.detail.article'),
          quantite: t('stock.quantity'),
          prix: t('invoices.detail.unitPrice'),
          tva: 'TVA',
          total: t('invoices.detail.lineTotal'),
        }}
      />

      <Totaux
        lignes={[
          { libelle: t('invoices.detail.subtotal'), montant: devis.subtotal },
          { libelle: 'TVA', montant: devis.taxAmount },
          { libelle: t('invoices.amount'), montant: devis.totalAmount, fort: true },
        ]}
      />
    </div>
  );
}
