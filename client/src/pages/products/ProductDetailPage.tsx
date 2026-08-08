import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productsApi } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Bloc, Champ, DocumentEnTete } from '@/components/shared/DocumentView';
import { Chiffres, Historique } from '@/components/shared/Historique';
import { CodesBarres } from '@/components/shared/CodesBarres';
import { FournisseursArticle } from '@/components/shared/FournisseursArticle';

const STATUT_FACTURE: Record<string, string> = {
  draft: 'muted', sent: 'info', partial: 'warning',
  paid: 'success', overdue: 'destructive', cancelled: 'secondary',
};

/** Nombre de jours au-delà duquel une péremption cesse d'être une alerte. */
const SEUIL_PEREMPTION_JOURS = 30;

function joursAvant(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function ProductDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => productsApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/products" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('products.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.product_not_found')}</p>
      </div>
    );
  }

  const p = data.data;
  const s = p.stats;
  const enAlerte = p.alertThreshold != null && Number(p.stockQuantity) <= Number(p.alertThreshold);

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/products"
        retourLibelle={t('products.title')}
        titre={p.name}
        statut={{
          libelle: t(`products.type.${p.type}`),
          variant: p.type === 'material' ? 'warning' : p.type === 'both' ? 'info' : 'secondary',
        }}
      />

      <Chiffres
        items={[
          { libelle: t('products.stockQuantity'), montant: Number(p.stockQuantity) },
          { libelle: t('products.stockValue'), montant: s.valeurStock },
          { libelle: t('products.revenue'), montant: s.chiffreAffaires },
          { libelle: t('products.unitMargin'), montant: s.margeUnitaire },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc titre={t('products.identity')}>
          <Champ libelle={t('products.code')} valeur={p.code ?? '—'} />
          <Champ libelle={t('products.unit')} valeur={p.unit} />
          <Champ libelle={t('common.description')} valeur={p.description ?? '—'} />
          <Champ
            libelle={t('common.status')}
            valeur={
              <Badge variant={p.isActive ? 'success' : 'secondary'}>
                {p.isActive ? t('common.active') : t('common.inactive')}
              </Badge>
            }
          />
        </Bloc>

        <Bloc titre={t('products.pricing')}>
          <Champ libelle={t('products.price')} valeur={formatCurrency(p.defaultSalesPrice ?? 0)} />
          <Champ libelle={t('products.averageCost')} valeur={formatCurrency(p.averageCostPerUnit ?? 0)} />
          <Champ
            libelle={t('products.margin')}
            valeur={
              // Une marge négative ne se distingue pas d'une marge faible dans
              // une colonne de chiffres : elle se signale.
              <span className={s.margeUnitaire < 0 ? 'text-destructive font-medium' : undefined}>
                {formatCurrency(s.margeUnitaire)} ({s.margePercent} %)
              </span>
            }
          />
          <Champ libelle={t('products.soldQuantity')} valeur={formatNumber(s.quantiteVendue)} />
        </Bloc>

        <Bloc titre={t('products.stock')}>
          <Champ libelle={t('products.available')} valeur={formatNumber(Number(p.stockQuantity) - Number(p.reservedQuantity ?? 0))} />
          <Champ libelle={t('products.reserved')} valeur={formatNumber(p.reservedQuantity ?? 0)} />
          <Champ
            libelle={t('stock.thresholdLabel')}
            valeur={
              p.alertThreshold == null ? '—' : (
                <span className={enAlerte ? 'text-destructive font-medium' : undefined}>
                  {formatNumber(p.alertThreshold)}
                  {enAlerte ? ` — ${t('stock.belowThreshold')}` : ''}
                </span>
              )
            }
          />
          <Champ
            libelle={t('products.earliestExpiration')}
            valeur={p.earliestExpirationDate ? formatDate(p.earliestExpirationDate) : '—'}
          />
        </Bloc>
      </div>

      <FournisseursArticle productId={p.id} />

      <CodesBarres productId={p.id} />

      <Historique
        titre={t('products.batches')}
        lignes={p.lots ?? []}
        vide={t('products.noBatch')}
        colonnes={[
          { entete: t('products.batch'), rendu: (l: any) => l.batchNumber ?? '—' },
          { entete: t('products.quantity'), rendu: (l: any) => formatNumber(l.quantity), droite: true },
          { entete: t('products.costPerUnit'), rendu: (l: any) => formatCurrency(l.costPerUnit), droite: true },
          { entete: t('products.enteredAt'), rendu: (l: any) => formatDate(l.enteredAt) },
          {
            entete: t('products.expiresAt'),
            rendu: (l: any) => {
              const j = joursAvant(l.expiresAt);
              if (j === null) return '—';
              // Un lot périmé ou proche de l'être est la seule information de ce
              // tableau sur laquelle on agit le jour même.
              const urgent = j <= SEUIL_PEREMPTION_JOURS;
              return (
                <span className={urgent ? 'text-destructive font-medium' : undefined}>
                  {formatDate(l.expiresAt)}
                  {j < 0 ? ` — ${t('products.expired')}` : urgent ? ` — J-${j}` : ''}
                </span>
              );
            },
          },
        ]}
      />

      <Historique
        titre={t('products.salesHistory')}
        lignes={p.ventes ?? []}
        vide={t('products.noSale')}
        colonnes={[
          {
            entete: t('invoices.number'),
            rendu: (v: any) => (
              <Link to={`/invoices/${v.id}`} className="text-primary hover:underline">
                {v.invoiceNumber}
              </Link>
            ),
          },
          { entete: t('invoices.invoiceDate'), rendu: (v: any) => formatDate(v.invoiceDate) },
          { entete: t('customers.title'), rendu: (v: any) => v.customerName },
          { entete: t('products.quantity'), rendu: (v: any) => `${formatNumber(v.quantity)} ${v.unit ?? ''}`, droite: true },
          { entete: t('products.price'), rendu: (v: any) => formatCurrency(v.unitPrice), droite: true },
          { entete: t('common.total'), rendu: (v: any) => formatCurrency(v.lineTotal), droite: true },
          {
            entete: t('common.status'),
            rendu: (v: any) => <Badge variant={(STATUT_FACTURE[v.status] ?? 'muted') as any}>{t(`status.${v.status}`)}</Badge>,
          },
        ]}
      />

      <Historique
        titre={t('products.purchaseHistory')}
        lignes={p.achats ?? []}
        vide={t('products.noPurchase')}
        colonnes={[
          {
            entete: t('purchases.blNumber'),
            rendu: (a: any) => (
              <Link to={`/purchases/receptions/${a.id}`} className="text-primary hover:underline">
                {a.blNumber}
              </Link>
            ),
          },
          { entete: t('purchases.receptionDate'), rendu: (a: any) => formatDate(a.receptionDate) },
          { entete: t('suppliers.title'), rendu: (a: any) => a.supplierName },
          { entete: t('products.quantity'), rendu: (a: any) => formatNumber(a.quantity), droite: true },
          { entete: t('products.costPerUnit'), rendu: (a: any) => formatCurrency(a.unitPrice), droite: true },
        ]}
      />
    </div>
  );
}
