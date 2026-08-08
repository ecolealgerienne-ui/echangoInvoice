import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

/**
 * Briques communes aux pages détail des documents de vente.
 *
 * Devis, BL et facture ont la même anatomie — un en-tête, un client, des
 * lignes, des totaux — mais pas les mêmes champs ni les mêmes actions. Un
 * composant unique à quinze propriétés aurait fini par ne convenir à aucun
 * des trois ; ces briques laissent chaque page composer ce qui la concerne.
 */

interface EnTeteProps {
  retourVers: string;
  retourLibelle: string;
  titre: string;
  statut?: { libelle: string; variant: string };
  actions?: ReactNode;
}

export function DocumentEnTete({ retourVers, retourLibelle, titre, statut, actions }: EnTeteProps) {
  return (
    <div className="space-y-3">
      <Link
        to={retourVers}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {retourLibelle}
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">{titre}</h1>
          {statut && <Badge variant={statut.variant as never}>{statut.libelle}</Badge>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

export function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{titre}</h2>
      {children}
    </div>
  );
}

/** Une ligne « libellé : valeur ». Les valeurs absentes sont masquées. */
export function Champ({ libelle, valeur }: { libelle: string; valeur: ReactNode }) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{libelle}</span>
      <span className="text-foreground text-right">{valeur}</span>
    </div>
  );
}

/**
 * Champ dont la valeur mène au document lié.
 *
 * Une facture affiche le numéro du BL dont elle est issue ; sans lien, il faut
 * retourner à la liste des BL et le retrouver à la main. C'est ce qui sépare
 * un ensemble de documents d'un dossier qu'on peut remonter.
 */
export function ChampLien({ libelle, valeur, vers }: {
  libelle: string;
  valeur: ReactNode;
  vers: string | null | undefined;
}) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{libelle}</span>
      {vers
        ? <Link to={vers} className="text-primary hover:underline text-right">{valeur}</Link>
        : <span className="text-foreground text-right">{valeur}</span>}
    </div>
  );
}

export interface LigneDocument {
  id: string;
  productCode: string | null;
  productName: string | null;
  quantity: string | number;
  unit: string;
  unitPrice: string | number;
  taxRate1?: string | number | null;
  lineTotal: string | number;
}

/**
 * Tableau des lignes. C'est le contenu que rien ne montrait jusqu'ici dès
 * qu'un document quittait le brouillon : les modales de saisie sont réservées
 * aux brouillons, et l'utilisateur devait ouvrir le PDF pour savoir ce qu'il
 * avait facturé.
 */
export function LignesDocument({ lignes, libelles }: {
  lignes: LigneDocument[];
  libelles: { article: string; quantite: string; prix: string; tva: string; total: string };
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{libelles.article}</th>
            <th className="text-right px-4 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{libelles.quantite}</th>
            <th className="text-right px-4 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{libelles.prix}</th>
            <th className="text-right px-4 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{libelles.tva}</th>
            <th className="text-right px-4 py-2.5 font-medium text-2xs uppercase tracking-wide text-muted-foreground">{libelles.total}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-4 py-2.5">
                <div className="text-foreground">{l.productName ?? '—'}</div>
                {l.productCode && (
                  <div className="text-xs text-muted-foreground">{l.productCode}</div>
                )}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {Number(l.quantity)} {l.unit}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {formatCurrency(l.unitPrice)}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {l.taxRate1 != null ? `${Number(l.taxRate1)} %` : '—'}
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium">
                {formatCurrency(l.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pied de totaux. Les lignes marquées `fort` sont mises en avant : le total
 * TTC et le reste dû sont les deux seuls chiffres qu'on cherche du regard.
 */
export function Totaux({ lignes }: { lignes: { libelle: string; montant: unknown; fort?: boolean }[] }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 sm:ml-auto sm:w-80">
      {lignes.map(({ libelle, montant, fort }) => (
        <div
          key={libelle}
          className={`flex justify-between gap-4 ${fort ? 'text-base font-semibold text-foreground border-t border-border pt-1.5 mt-1.5' : 'text-sm'}`}
        >
          <span className={fort ? '' : 'text-muted-foreground'}>{libelle}</span>
          <span className={fort ? '' : 'text-foreground'}>{formatCurrency(montant as never)}</span>
        </div>
      ))}
    </div>
  );
}
