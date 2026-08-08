import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { invoicesApi } from '@/lib/api';
import { varianteStatut } from '@/lib/statuts';
import { libelleMode } from '@/lib/modesReglement';
import { enregistrerBlob } from '@/lib/download';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import {
  Bloc, Champ, ChampLien, DocumentEnTete, LignesDocument, Totaux,
} from '@/components/shared/DocumentView';



export function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoicesApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/invoices" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('invoices.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.invoice_not_found')}</p>
      </div>
    );
  }

  const facture = data.data;
  const client = facture.customer;

  function telechargerPdf() {
    invoicesApi.pdf(id!)
      .then((blob: Blob) => enregistrerBlob(blob, `${facture.invoiceNumber}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/invoices"
        retourLibelle={t('invoices.title')}
        titre={facture.invoiceNumber}
        statut={{
          libelle: t(`invoices.status.${facture.status}`),
          variant: varianteStatut(facture.status),
        }}
        actions={
          <Button variant="outline" size="sm" onClick={telechargerPdf}>
            <FileDown className="h-4 w-4" /> PDF
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('invoices.customer')}>
          {/* Le nom mène à la fiche client : c'est de là qu'on voit les autres
              factures et l'encours total avant de décider d'une relance. */}
          {client ? (
            <Link to={`/customers/${client.id}`} className="text-sm font-medium text-primary hover:underline">
              {client.name}
            </Link>
          ) : <p className="text-sm text-muted-foreground">—</p>}
          <Champ libelle={t('customers.nif')} valeur={client?.nif} />
          <Champ libelle={t('customers.rc')} valeur={client?.rc} />
          <Champ libelle={t('customers.address')} valeur={client?.address} />
          <Champ libelle={t('customers.city')} valeur={client?.city} />
          <Champ libelle={t('customers.phone')} valeur={client?.phone} />
          <Champ libelle={t('customers.email')} valeur={client?.email} />
        </Bloc>

        <Bloc titre={t('invoices.detail.document')}>
          <Champ libelle={t('invoices.invoiceDate')} valeur={formatDate(facture.invoiceDate)} />
          <Champ libelle={t('invoices.dueDate')} valeur={formatDate(facture.dueDate)} />
          {/* Le document d'origine explique d'où vient la facture : sans lui,
              une facture créée depuis un BL paraît sortie de nulle part. */}
          <ChampLien
            libelle={t('deliveries.blNumber')}
            valeur={facture.blNumber}
            vers={facture.deliveryNoteId ? `/deliveries/${facture.deliveryNoteId}` : null}
          />
          <ChampLien
            libelle={t('quotes.quoteNumber')}
            valeur={facture.quoteNumber}
            vers={facture.quoteId ? `/quotes/${facture.quoteId}` : null}
          />
          <Champ libelle={t('common.notes')} valeur={facture.notes} />
        </Bloc>
      </div>

      <LignesDocument
        lignes={facture.items ?? []}
        libelles={{
          article: t('invoices.detail.article'),
          quantite: t('stock.quantity'),
          prix: t('invoices.detail.unitPrice'),
          tva: 'TVA',
          total: t('invoices.detail.lineTotal'),
        }}
      />

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 space-y-4">
          {facture.payments?.length > 0 && (
            <Bloc titre={t('invoices.detail.payments')}>
              {facture.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(p.paymentDate)} · {libelleMode(t, p.paymentMethod)}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                  <span className="text-foreground">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </Bloc>
          )}

          {/* Sans ce bloc, une facture dont le solde a baissé sans encaissement
              est incompréhensible : l'avoir est la seule explication. */}
          {facture.creditNotes?.length > 0 && (
            <Bloc titre={t('creditNotes.title')}>
              {facture.creditNotes.map((a: any) => (
                <div key={a.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {a.creditNoteNumber} · {formatDate(a.creditNoteDate)}
                    {a.reason ? ` · ${a.reason}` : ''}
                  </span>
                  <span className="flex items-center gap-2 text-foreground whitespace-nowrap">
                    {formatCurrency(a.totalAmount)}
                    <Badge variant={a.status === 'applied' ? 'success' : 'muted'}>
                      {t(`creditNotes.status.${a.status}`)}
                    </Badge>
                  </span>
                </div>
              ))}
            </Bloc>
          )}
        </div>

        <Totaux
          lignes={[
            { libelle: t('invoices.detail.subtotal'), montant: facture.subtotal },
            { libelle: 'TVA', montant: facture.taxAmount },
            { libelle: t('invoices.amount'), montant: facture.totalAmount, fort: true },
            { libelle: t('invoices.paid'), montant: facture.amountPaid },
            ...(Number(facture.creditedAmount) > 0
              ? [{ libelle: t('invoices.credited'), montant: facture.creditedAmount }]
              : []),
            { libelle: t('invoices.due'), montant: facture.amountDue, fort: true },
          ]}
        />
      </div>
    </div>
  );
}
