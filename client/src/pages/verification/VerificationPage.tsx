import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { verificationApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

const TITRES: Record<string, string> = {
  facture: 'Facture', devis: 'Devis', bl: 'Bon de livraison', avoir: 'Avoir',
};

/**
 * Page publique atteinte en scannant le QR d'un document.
 *
 * Elle est vue par le **destinataire**, qui n'a pas de compte et ne connaît pas
 * l'application : pas de menu, pas de navigation, une seule réponse à une seule
 * question — ce papier est-il authentique.
 *
 * Elle n'affiche ni lignes, ni coordonnées, ni marge : le serveur ne les envoie
 * pas, et l'écran ne doit pas donner envie de les demander.
 */
export function VerificationPage() {
  const { t } = useTranslation();
  const { type, id, signature } = useParams<{ type: string; id: string; signature: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['verification', type, id, signature],
    queryFn: () => verificationApi.verifier(type!, id!, signature!),
    enabled: Boolean(type && id && signature),
    retry: false,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;

  if (isError || !data?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border border-border p-6 text-center space-y-3">
          <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
          <h1 className="text-lg font-bold text-foreground">{t('verification.introuvable')}</h1>
          <p className="text-sm text-muted-foreground">{t('verification.introuvableAide')}</p>
        </div>
      </div>
    );
  }

  const d = data.data;
  const Icone = d.valide ? CheckCircle2 : XCircle;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border overflow-hidden">
        <div className={`p-6 text-center ${d.valide ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-destructive/10'}`}>
          <Icone className={`h-12 w-12 mx-auto ${d.valide ? 'text-emerald-600' : 'text-destructive'}`} />
          <h1 className="mt-3 text-lg font-bold text-foreground">
            {d.valide ? t('verification.authentique') : t('verification.annule')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {TITRES[d.type] ?? d.type} n° {d.numero}
          </p>
        </div>

        <dl className="divide-y divide-border">
          {[
            [t('verification.emetteur'), d.emetteur],
            ['NIF', d.emetteurNif],
            [t('verification.destinataire'), d.destinataire],
            [t('verification.date'), formatDate(d.date)],
            [t('common.total'), formatCurrency(d.total)],
          ].filter(([, v]) => v).map(([libelle, valeur]) => (
            <div key={String(libelle)} className="flex justify-between px-5 py-3 text-sm">
              <dt className="text-muted-foreground">{libelle}</dt>
              <dd className="font-medium text-foreground text-right">{valeur}</dd>
            </div>
          ))}
        </dl>

        <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border">
          {t('verification.note')}
        </p>
      </div>
    </div>
  );
}
