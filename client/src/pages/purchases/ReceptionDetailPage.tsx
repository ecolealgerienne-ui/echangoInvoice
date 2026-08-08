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
import { Bloc, Champ, ChampLien, DocumentEnTete } from '@/components/shared/DocumentView';
import { Historique } from '@/components/shared/Historique';

const STATUT: Record<string, string> = {
  pending: 'muted', partial: 'warning', completed: 'success',
};
const STATUT_LOT: Record<string, string> = {
  available: 'success', reserved: 'warning', sold: 'muted', adjusted: 'secondary',
};

export function ReceptionDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reception', id],
    queryFn: () => purchasesApi.getReception(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/purchases" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('purchases.receptionsTitle')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.reception_bl_not_found')}</p>
      </div>
    );
  }

  const reception = data.data;
  const commande = reception.purchaseOrder;
  const lots = reception.stockEntries ?? [];

  // La valeur reçue ne figure sur aucune colonne : elle se recompose depuis
  // les lots, qui portent le coût réellement entré en stock.
  const valeur = lots.reduce((s: number, l: any) => s + Number(l.totalCost ?? 0), 0);

  function telechargerPdf() {
    purchasesApi.pdfReception(id!)
      .then((blob: Blob) => enregistrerBlob(blob, `${reception.blNumber}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/purchases"
        retourLibelle={t('purchases.receptionsTitle')}
        titre={reception.blNumber}
        statut={{
          libelle: t(`purchases.receptionStatus.${reception.status}`),
          variant: STATUT[reception.status] ?? 'muted',
        }}
        actions={
          <Button variant="outline" size="sm" onClick={telechargerPdf}>
            <FileDown className="h-4 w-4" /> {t('purchases.pdfReception')}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('purchases.supplier')}>
          {commande?.supplierId ? (
            <Link
              to={`/suppliers/${commande.supplierId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {commande.supplierName}
            </Link>
          ) : <p className="text-sm text-muted-foreground">—</p>}
          <ChampLien
            libelle={t('purchases.poNumber')}
            valeur={commande?.poNumber}
            vers={commande?.id ? `/purchases/orders/${commande.id}` : null}
          />
        </Bloc>

        <Bloc titre={t('invoices.detail.document')}>
          <Champ libelle={t('purchases.receptionDate')} valeur={formatDate(reception.receptionDate)} />
          <Champ
            libelle={t('purchases.totalReceived')}
            valeur={formatNumber(reception.totalQuantityReceived)}
          />
          <Champ libelle={t('stock.value')} valeur={formatCurrency(valeur)} />
          <Champ libelle={t('common.notes')} valeur={reception.notes} />
        </Bloc>
      </div>

      {/* Le contenu réel d'une réception, ce sont les lots qu'elle a créés :
          c'est là qu'on retrouve le coût d'entrée et la péremption, et c'est
          ce que consomme ensuite le FIFO. */}
      <Historique
        titre={t('purchases.detail.lots')}
        lignes={lots}
        vide={t('stock.noLots')}
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
          { entete: t('stock.lotNumber'), rendu: (l: any) => <span className="font-mono text-xs">{l.batchNumber ?? '—'}</span> },
          { entete: t('stock.quantity'), droite: true, rendu: (l: any) => formatNumber(l.quantity) },
          { entete: t('stock.unitCost'), droite: true, rendu: (l: any) => formatCurrency(l.costPerUnit) },
          { entete: t('stock.value'), droite: true, rendu: (l: any) => formatCurrency(l.totalCost) },
          { entete: t('stock.expiry'), rendu: (l: any) => (l.expiresAt ? formatDate(l.expiresAt) : '—') },
          {
            entete: t('common.status'),
            rendu: (l: any) => (
              <Badge variant={STATUT_LOT[l.status] as never}>{t(`stock.lotStatus.${l.status}`)}</Badge>
            ),
          },
        ]}
      />
    </div>
  );
}
