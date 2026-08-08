import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { purchasesApi } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { FileDown } from 'lucide-react';
import { enregistrerBlob } from '@/lib/download';
import { useToast } from '@/components/ui/Toast';
import { Bloc, Champ, DocumentEnTete, Totaux } from '@/components/shared/DocumentView';
import { Historique } from '@/components/shared/Historique';

const STATUT: Record<string, string> = {
  draft: 'muted', sent: 'info', received: 'success', invoiced: 'success', cancelled: 'secondary',
};
const STATUT_RECEPTION: Record<string, string> = {
  pending: 'muted', partial: 'warning', completed: 'success',
};
const STATUT_FACTURE: Record<string, string> = {
  draft: 'muted', validated: 'info', partial: 'warning', paid: 'success', cancelled: 'secondary',
};

export function PurchaseOrderDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => purchasesApi.getOrder(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/purchases" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('purchases.ordersTitle')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.purchase_order_not_found')}</p>
      </div>
    );
  }

  const commande = data.data;

  function telechargerPdf() {
    purchasesApi.pdfOrder(id!)
      .then((blob: Blob) => enregistrerBlob(blob, `${commande.poNumber}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/purchases"
        retourLibelle={t('purchases.ordersTitle')}
        titre={commande.poNumber}
        statut={{
          libelle: t(`status.${commande.status}`),
          variant: STATUT[commande.status] ?? 'muted',
        }}
        actions={
          <Button variant="outline" size="sm" onClick={telechargerPdf}>
            <FileDown className="h-4 w-4" /> {t('purchases.pdfOrder')}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('purchases.supplier')}>
          {commande.supplierId ? (
            <Link
              to={`/suppliers/${commande.supplierId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {commande.supplier?.name ?? '—'}
            </Link>
          ) : <p className="text-sm text-muted-foreground">—</p>}
          <Champ libelle={t('suppliers.nif')} valeur={commande.supplier?.nif} />
          <Champ libelle={t('suppliers.phone')} valeur={commande.supplier?.phone} />
          <Champ libelle={t('suppliers.email')} valeur={commande.supplier?.email} />
        </Bloc>

        <Bloc titre={t('invoices.detail.document')}>
          <Champ libelle={t('purchases.orderDate')} valeur={formatDate(commande.orderDate)} />
          <Champ
            libelle={t('purchases.expectedDelivery')}
            valeur={commande.expectedDeliveryDate ? formatDate(commande.expectedDeliveryDate) : null}
          />
          <Champ libelle="Notes" valeur={commande.notes} />
        </Bloc>
      </div>

      {/* Les lignes d'achat portent un taux de TVA unique (`taxRate`), là où
          une ligne de vente en porte deux. On n'affiche donc pas la même
          colonne, et le tableau de vente ne convenait pas tel quel. */}
      <Historique
        titre={t('common.items')}
        lignes={commande.items}
        vide={t('partners.detail.noOrder')}
        colonnes={[
          {
            entete: t('invoices.detail.article'),
            rendu: (l: any) => (
              <>
                <div className="text-foreground">{l.productName ?? '—'}</div>
                {l.productCode && <div className="text-xs text-muted-foreground">{l.productCode}</div>}
              </>
            ),
          },
          { entete: t('stock.quantity'), droite: true, rendu: (l: any) => `${Number(l.quantity)} ${l.unit}` },
          { entete: t('invoices.detail.unitPrice'), droite: true, rendu: (l: any) => formatCurrency(l.unitPrice) },
          { entete: 'TVA', droite: true, rendu: (l: any) => (l.taxRate != null ? `${Number(l.taxRate)} %` : '—') },
          { entete: t('invoices.detail.lineTotal'), droite: true, rendu: (l: any) => formatCurrency(l.lineTotal) },
        ]}
      />

      <Totaux
        lignes={[
          { libelle: t('invoices.detail.subtotal'), montant: commande.subtotal },
          { libelle: 'TVA', montant: commande.taxAmount },
          { libelle: t('invoices.amount'), montant: commande.total, fort: true },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Historique
          titre={t('purchases.receptionsTitle')}
          lignes={commande.receptions}
          vide={t('partners.detail.noReception')}
          colonnes={[
            {
              entete: t('purchases.blNumber'),
              rendu: (r: any) => (
                <Link to={`/purchases/receptions/${r.id}`} className="font-mono text-primary hover:underline">
                  {r.blNumber}
                </Link>
              ),
            },
            { entete: t('common.date'), rendu: (r: any) => formatDate(r.receptionDate) },
            {
              entete: t('purchases.totalReceived'),
              droite: true,
              rendu: (r: any) => formatNumber(r.totalQuantityReceived),
            },
            {
              entete: t('common.status'),
              rendu: (r: any) => (
                <Badge variant={STATUT_RECEPTION[r.status] as never}>
                  {t(`purchases.receptionStatus.${r.status}`)}
                </Badge>
              ),
            },
          ]}
        />

        <Historique
          titre={t('purchases.billsTitle')}
          lignes={commande.bills}
          vide={t('partners.detail.noVendorBill')}
          colonnes={[
            {
              entete: t('invoices.number'),
              rendu: (f: any) => (
                <Link to={`/purchases/vendor-bills/${f.id}`} className="font-mono text-primary hover:underline">
                  {f.billNumber}
                </Link>
              ),
            },
            { entete: t('common.date'), rendu: (f: any) => formatDate(f.billDate) },
            { entete: t('common.amount'), droite: true, rendu: (f: any) => formatCurrency(f.totalAmount) },
            {
              entete: t('common.status'),
              rendu: (f: any) => (
                <Badge variant={STATUT_FACTURE[f.status] as never}>
                  {t(`purchases.billStatus.${f.status}`)}
                </Badge>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
