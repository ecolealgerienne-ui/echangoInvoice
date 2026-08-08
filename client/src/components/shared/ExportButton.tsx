import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { exportApi, resolveApiError } from '@/lib/api';
import { enregistrerBlob, nomDepuisReponse, lisibiliserErreurBlob } from '@/lib/download';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface Props {
  /** Clé du jeu de données côté API (ex. « factures »). */
  dataset: string;
  /**
   * Filtres courants de l'écran. Les valeurs vides sont retirées : le serveur
   * refuse un filtre que le jeu ne connaît pas, et une chaîne vide compte.
   */
  filtres?: Record<string, string | undefined>;
  /**
   * Libellé du bouton. À préciser quand un écran propose plusieurs exports :
   * deux boutons « Exporter » côte à côte n'apprennent rien sur ce qu'ils
   * contiennent.
   */
  libelle?: string;
}

const DIALECTES = [
  { cle: 'fr', libelle: 'exportButton.excelFr', detail: 'exportButton.excelFrDetail' },
  { cle: 'intl', libelle: 'exportButton.csvStandard', detail: 'exportButton.csvStandardDetail' },
] as const;

/**
 * Bouton d'export CSV, à poser dans la barre de filtres d'un écran de liste.
 *
 * L'export porte sur la SÉLECTION COURANTE, pas sur la page affichée. C'est
 * l'attente : on filtre sur un mois, on exporte ce mois — pas les vingt lignes
 * que la pagination laisse voir.
 *
 * Le choix du dialecte est offert au clic plutôt que caché dans les réglages.
 * Un fichier destiné à Excel et un fichier destiné à un import ne se
 * ressemblent pas, et l'utilisateur qui se trompe le voit immédiatement.
 */
export function ExportButton({ dataset, filtres, libelle }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function dehors(e: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener('mousedown', dehors);
    return () => document.removeEventListener('mousedown', dehors);
  }, []);

  // L'API réserve l'export aux propriétaires et gérants. Afficher le bouton à
  // un agent ne produirait qu'un 403 incompréhensible pour lui.
  if (user?.role !== 'owner' && user?.role !== 'manager') return null;

  async function telecharger(dialect: string) {
    setOuvert(false);
    setEnCours(true);
    try {
      const nettoyes = Object.fromEntries(
        Object.entries(filtres ?? {}).filter(([, v]) => v !== undefined && v !== ''),
      );
      const reponse = await exportApi.download(dataset, { ...nettoyes, dialect });
      enregistrerBlob(reponse.data, nomDepuisReponse(reponse, `${dataset}.csv`));
    } catch (erreur) {
      toast(resolveApiError(await lisibiliserErreurBlob(erreur), t), 'error');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="relative" ref={conteneur}>
      <Button variant="outline" size="sm" disabled={enCours} onClick={() => setOuvert(o => !o)}>
        {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {libelle ?? t('exportButton.label')}
      </Button>
      {ouvert && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-1 w-64">
          {DIALECTES.map(({ cle, libelle, detail }) => (
            <button
              key={cle}
              onClick={() => telecharger(cle)}
              className="w-full px-3 py-2 rounded hover:bg-muted text-left transition-colors"
            >
              <div className="text-sm font-medium">{t(libelle)}</div>
              <div className="text-xs text-muted-foreground">{t(detail)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
