import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { deliveriesApi } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { enregistrerBlob } from '@/lib/download';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import {
  Bloc, Champ, ChampLien, DocumentEnTete, LignesDocument, Totaux,
} from '@/components/shared/DocumentView';


export function DeliveryNoteDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['delivery-note', id],
    queryFn: () => deliveriesApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/deliveries" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('deliveries.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.delivery_note_not_found')}</p>
      </div>
    );
  }

  const bl = data.data;
  const client = bl.customer;

  function telechargerPdf() {
    deliveriesApi.pdf(id!)
      .then((blob: Blob) => enregistrerBlob(blob, `${bl.blNumber}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/deliveries"
        retourLibelle={t('deliveries.title')}
        titre={bl.blNumber}
        statut={{
          libelle: t(`deliveries.status.${bl.status}`),
          variant: varianteStatut(bl.status),
        }}
        actions={
          <Button variant="outline" size="sm" onClick={telechargerPdf}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        <Bloc titre={t('common.customer')}>
          {client ? (
            <Link to={`/customers/${client.id}`} className="text-sm font-medium text-primary hover:underline">
              {client.name}
            </Link>
          ) : <p className="text-sm text-muted-foreground">—</p>}
          <Champ libelle={t('customers.nif')} valeur={client?.nif} />
          {/* Adresse de livraison quand elle diffère : c'est celle-là que
              regarde le chauffeur, pas l'adresse de facturation. */}
          <Champ
            libelle={t('deliveries.detail.shipTo')}
            valeur={client?.shippingAddress ?? client?.address}
          />
          <Champ libelle={t('customers.city')} valeur={client?.shippingCity ?? client?.city} />
          <Champ libelle={t('customers.phone')} valeur={client?.phone} />
        </Bloc>

        <Bloc titre={t('invoices.detail.document')}>
          <Champ libelle={t('common.date')} valeur={formatDate(bl.deliveryDate)} />
          <Champ
            libelle={t('deliveries.detail.signed')}
            valeur={bl.customerSignature
              ? `${t('common.yes')}${bl.signedDate ? ` — ${formatDate(bl.signedDate)}` : ''}`
              : t('common.no')}
          />
          <ChampLien
            libelle={t('invoices.detail.invoice')}
            valeur={bl.invoiceNumber}
            vers={bl.convertedToInvoiceId ? `/invoices/${bl.convertedToInvoiceId}` : null}
          />
          <ChampLien
            libelle={t('quotes.quoteNumber')}
            valeur={bl.quoteNumber}
            vers={bl.quoteId ? `/quotes/${bl.quoteId}` : null}
          />
          <Champ libelle={t('common.notes')} valeur={bl.notes} />
        </Bloc>
      </div>

      <LignesDocument
        lignes={bl.items ?? []}
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
          { libelle: t('invoices.detail.subtotal'), montant: bl.subtotal },
          { libelle: 'TVA', montant: bl.taxAmount },
          { libelle: t('invoices.amount'), montant: bl.total, fort: true },
        ]}
      />
    </div>
  );
}
