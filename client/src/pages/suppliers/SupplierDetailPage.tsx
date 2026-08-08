import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { suppliersApi } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Bloc, Champ, DocumentEnTete } from '@/components/shared/DocumentView';
import { Chiffres, Historique } from '@/components/shared/Historique';

const STATUT_FACTURE: Record<string, string> = {
  draft: 'muted', validated: 'info', partial: 'warning', paid: 'success', cancelled: 'secondary',
};
const STATUT_COMMANDE: Record<string, string> = {
  draft: 'muted', sent: 'info', received: 'success', invoiced: 'success', cancelled: 'secondary',
};
const STATUT_RECEPTION: Record<string, string> = {
  pending: 'muted', partial: 'warning', completed: 'success',
};
const MODE: Record<string, string> = {
  cash: 'Espèces', bank_transfer: 'Virement', cheque: 'Chèque', other: 'Autre',
};

export function SupplierDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => suppliersApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/suppliers" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('suppliers.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.supplier_not_found')}</p>
      </div>
    );
  }

  const fournisseur = data.data;
  const s = fournisseur.stats;

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/suppliers"
        retourLibelle={t('suppliers.title')}
        titre={fournisseur.name}
        statut={{
          libelle: fournisseur.isActive ? t('common.active') : t('common.inactive'),
          variant: fournisseur.isActive ? 'success' : 'secondary',
        }}
      />

      <Chiffres
        items={[
          { libelle: t('partners.detail.purchased'), montant: s.totalAchete },
          { libelle: t('partners.detail.settled'), montant: s.regle },
          { libelle: t('partners.detail.debt'), montant: s.dette },
          { libelle: t('partners.detail.overdue'), montant: s.enRetard, alerte: true },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloc titre={t('partners.detail.contact')}>
          <Champ libelle={t('suppliers.contactPerson')} valeur={fournisseur.contactPerson} />
          <Champ libelle={t('suppliers.phone')} valeur={fournisseur.phone} />
          <Champ libelle={t('suppliers.email')} valeur={fournisseur.email} />
          <Champ libelle={t('suppliers.address')} valeur={fournisseur.address} />
          <Champ libelle={t('customers.city')} valeur={fournisseur.city} />
        </Bloc>

        <Bloc titre={t('partners.detail.legal')}>
          <Champ libelle={t('suppliers.nif')} valeur={fournisseur.nif} />
          <Champ libelle={t('suppliers.rc')} valeur={fournisseur.rc} />
          <Champ libelle={t('customers.ai')} valeur={fournisseur.ai} />
          <Champ libelle={t('customers.nis')} valeur={fournisseur.nis} />
          <Champ libelle="Notes" valeur={fournisseur.notes} />
        </Bloc>
      </div>

      <Historique
        titre={`${t('purchases.billsTitle')} (${s.nbFactures})`}
        lignes={fournisseur.history.bills}
        vide={t('partners.detail.noVendorBill')}
        colonnes={[
          { entete: t('invoices.number'), rendu: (f: any) => <span className="font-mono">{f.billNumber}</span> },
          { entete: t('common.date'), rendu: (f: any) => formatDate(f.billDate) },
          { entete: t('invoices.dueDate'), rendu: (f: any) => formatDate(f.dueDate) },
          { entete: t('common.amount'), rendu: (f: any) => formatCurrency(f.totalAmount), droite: true },
          {
            entete: t('partners.detail.remaining'),
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
              <Badge variant={STATUT_FACTURE[f.status] as never}>
                {t(`purchases.billStatus.${f.status}`)}
              </Badge>
            ),
          },
        ]}
      />

      <Historique
        titre={t('partners.detail.vendorPayments')}
        lignes={fournisseur.history.payments}
        vide={t('partners.detail.noPayment')}
        colonnes={[
          { entete: t('common.date'), rendu: (p: any) => formatDate(p.paymentDate) },
          { entete: t('invoices.detail.invoice'), rendu: (p: any) => <span className="font-mono">{p.billNumber}</span> },
          { entete: t('partners.detail.method'), rendu: (p: any) => MODE[p.method] ?? p.method },
          { entete: t('partners.detail.reference'), rendu: (p: any) => p.reference ?? '—' },
          { entete: t('common.amount'), rendu: (p: any) => formatCurrency(p.amount), droite: true },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Historique
          titre={t('purchases.ordersTitle')}
          lignes={fournisseur.history.orders}
          vide={t('partners.detail.noOrder')}
          colonnes={[
            { entete: t('purchases.poNumber'), rendu: (o: any) => <span className="font-mono">{o.poNumber}</span> },
            { entete: t('common.date'), rendu: (o: any) => formatDate(o.orderDate) },
            { entete: t('common.amount'), rendu: (o: any) => formatCurrency(o.totalAmount), droite: true },
            {
              entete: t('common.status'),
              rendu: (o: any) => (
                <Badge variant={STATUT_COMMANDE[o.status] as never}>{t(`status.${o.status}`)}</Badge>
              ),
            },
          ]}
        />

        <Historique
          titre={t('purchases.receptionsTitle')}
          lignes={fournisseur.history.receptions}
          vide={t('partners.detail.noReception')}
          colonnes={[
            { entete: t('purchases.blNumber'), rendu: (r: any) => <span className="font-mono">{r.blNumber}</span> },
            { entete: t('common.date'), rendu: (r: any) => formatDate(r.receptionDate) },
            {
              entete: t('purchases.totalReceived'),
              rendu: (r: any) => formatNumber(r.totalQuantityReceived),
              droite: true,
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
      </div>
    </div>
  );
}
