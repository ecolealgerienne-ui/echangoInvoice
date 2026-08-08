import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { creditNotesApi } from '@/lib/api';
import { enregistrerBlob } from '@/lib/download';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Bloc, Champ, DocumentEnTete } from '@/components/shared/DocumentView';
import { Historique } from '@/components/shared/Historique';
import { useToast } from '@/components/ui/Toast';
import { FileDown } from 'lucide-react';

const STATUT: Record<string, string> = {
  draft: 'muted', issued: 'info', applied: 'success', cancelled: 'secondary',
};

/**
 * Fiche avoir — le dernier document commercial qui n'en avait pas.
 *
 * L'information qu'on vient y chercher est le **rattachement** : à quelle
 * facture cet avoir s'impute. Elle est donc en tête, et cliquable.
 */
export function CreditNoteDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['credit-note', id],
    queryFn: () => creditNotesApi.get(id!),
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) {
    return (
      <div className="space-y-3">
        <Link to="/credit-notes" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t('creditNotes.title')}
        </Link>
        <p className="text-sm text-foreground">{t('errors.credit_note_not_found')}</p>
      </div>
    );
  }

  const a = data.data;

  function telecharger() {
    creditNotesApi.pdf(a.id)
      .then((blob: Blob) => enregistrerBlob(blob, `${a.creditNoteNumber}.pdf`))
      .catch(() => toast(t('errors.generic'), 'error'));
  }

  return (
    <div className="space-y-5">
      <DocumentEnTete
        retourVers="/credit-notes"
        retourLibelle={t('creditNotes.title')}
        titre={`${t('creditNotes.one')} ${a.creditNoteNumber}`}
        statut={{ libelle: t(`status.${a.status}`), variant: (STATUT[a.status] ?? 'muted') as any }}
        actions={
          <Button size="sm" variant="outline" onClick={telecharger}>
            <FileDown className="h-4 w-4" /> {t('common.pdf')}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc titre={t('creditNotes.one')}>
          <Champ libelle={t('common.date')} valeur={formatDate(a.creditNoteDate)} />
          <Champ libelle={t('customers.title')} valeur={a.customer?.name ?? a.customerName ?? '—'} />
          <Champ
            libelle={t('creditNotes.originInvoice')}
            valeur={
              a.salesInvoiceId ? (
                <Link to={`/invoices/${a.salesInvoiceId}`} className="text-primary hover:underline">
                  {a.salesInvoice?.invoiceNumber ?? t('creditNotes.seeInvoice')}
                </Link>
              ) : (
                // Un avoir non rattaché est légitime mais mérite d'être signalé :
                // il ne s'impute à aucune facture.
                <span className="text-muted-foreground">{t('creditNotes.noOrigin')}</span>
              )
            }
          />
          <Champ libelle={t('creditNotes.reason')} valeur={a.reason || '—'} />
          <Champ libelle="Notes" valeur={a.notes || '—'} />
        </Bloc>

        <Bloc titre={t('common.total')}>
          <Champ libelle={t('reports.htBase')} valeur={formatCurrency(a.subtotal)} />
          <Champ libelle={t('settings.taxRate')} valeur={formatCurrency(a.taxAmount)} />
          <Champ
            libelle={t('common.total')}
            valeur={<span className="font-semibold">{formatCurrency(a.totalAmount)}</span>}
          />
          <Champ libelle={t('common.createdAt')} valeur={formatDate(a.createdAt)} />
        </Bloc>
      </div>

      <Historique
        titre={t('common.items')}
        lignes={(a.items ?? []).map((l: any, i: number) => ({ ...l, id: l.id ?? String(i) }))}
        vide={t('common.noData')}
        colonnes={[
          { entete: t('common.description'), rendu: (l: any) => l.description },
          { entete: t('common.qty'), rendu: (l: any) => `${formatNumber(l.quantity)} ${l.unit ?? ''}`, droite: true },
          { entete: t('purchases.unitPrice'), rendu: (l: any) => formatCurrency(l.unitPrice), droite: true },
          {
            entete: t('settings.taxRate'),
            rendu: (l: any) => (l.taxRate1 != null ? `${Number(l.taxRate1)} %` : '—'),
            droite: true,
          },
          { entete: t('common.total'), rendu: (l: any) => formatCurrency(l.lineTotal), droite: true },
        ]}
      />

      {a.status === 'cancelled' && (
        <p className="text-xs text-destructive">{t('creditNotes.cancelledNote')}</p>
      )}
    </div>
  );
}
