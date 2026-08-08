import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { purchasesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Bloc, Champ, DocumentEnTete, Totaux } from '@/components/shared/DocumentView';
import { Historique } from '@/components/shared/Historique';

const STATUT: Record<string, string> = {
  draft: 'muted', validated: 'info', partial: 'warning', paid: 'success', cancelled: 'secondary',
};
const MODE: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque', other: 'Autre',
};

export function VendorBillDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['vendor-bill', id],
    queryFn: () => purchasesApi.getBill(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/purchases/vendor-bills" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('purchases.billsTitle')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.vendor_bill_not_found')}</p>
      </div>
    );
  }

  const facture = data.data;

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/purchases/vendor-bills"
        retourLibelle={t('purchases.billsTitle')}
        titre={facture.billNumber}
        statut={{
          libelle: t(`purchases.billStatus.${facture.status}`),
          variant: STATUT[facture.status] ?? 'muted',
        }}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('purchases.supplier')}>
          {facture.supplierId ? (
            <Link
              to={`/suppliers/${facture.supplierId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {facture.supplierName}
            </Link>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </Bloc>

        <Bloc titre={t('invoices.detail.document')}>
          <Champ libelle={t('common.date')} valeur={formatDate(facture.billDate)} />
          <Champ libelle={t('invoices.dueDate')} valeur={formatDate(facture.dueDate)} />
          {/* Commande et réception : le rapprochement à trois documents, qui
              est la raison d'être d'une facture d'achat. */}
          <Champ libelle={t('purchases.poNumber')} valeur={facture.poNumber} />
          <Champ libelle={t('purchases.blNumber')} valeur={facture.receptionNumber} />
          <Champ libelle="Notes" valeur={facture.notes} />
        </Bloc>
      </div>

      <Historique
        titre={t('common.items')}
        lignes={facture.items}
        vide={t('partners.detail.noVendorBill')}
        colonnes={[
          {
            entete: t('invoices.detail.article'),
            rendu: (l: any) => (
              <>
                <div className="text-foreground">{l.productName ?? l.description ?? '—'}</div>
                {l.productCode && <div className="text-xs text-muted-foreground">{l.productCode}</div>}
              </>
            ),
          },
          { entete: t('stock.quantity'), droite: true, rendu: (l: any) => `${Number(l.quantity)} ${l.unit ?? ''}` },
          { entete: t('invoices.detail.unitPrice'), droite: true, rendu: (l: any) => formatCurrency(l.unitPrice) },
          { entete: 'TVA', droite: true, rendu: (l: any) => (l.taxRate != null ? `${Number(l.taxRate)} %` : '—') },
          { entete: t('invoices.detail.lineTotal'), droite: true, rendu: (l: any) => formatCurrency(l.lineTotal) },
        ]}
      />

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Historique
            titre={t('partners.detail.vendorPayments')}
            lignes={facture.payments}
            vide={t('partners.detail.noPayment')}
            colonnes={[
              { entete: t('common.date'), rendu: (p: any) => formatDate(p.paymentDate) },
              { entete: t('partners.detail.method'), rendu: (p: any) => MODE[p.method] ?? p.method },
              { entete: t('partners.detail.reference'), rendu: (p: any) => p.reference ?? '—' },
              { entete: t('common.amount'), droite: true, rendu: (p: any) => formatCurrency(p.amount) },
            ]}
          />
        </div>

        <Totaux
          lignes={[
            { libelle: t('invoices.detail.subtotal'), montant: facture.subtotal },
            { libelle: 'TVA', montant: facture.taxAmount },
            { libelle: t('invoices.amount'), montant: facture.totalAmount, fort: true },
            { libelle: t('partners.detail.settled'), montant: facture.amountPaid },
            { libelle: t('partners.detail.remaining'), montant: facture.amountDue, fort: true },
          ]}
        />
      </div>
    </div>
  );
}
