import { ReactNode } from 'react';
import { formatCurrency } from '@/lib/utils';
import { TableConteneur } from '@/components/ui/DataTable';
import { KpiCard } from '@/components/ui/KpiCard';

/**
 * Tableau d'historique d'une fiche tiers, et bandeau de chiffres clés.
 *
 * Les fiches client et fournisseur affichent chacune quatre historiques
 * (documents, règlements…) aux colonnes différentes. Écrits à la main, cela
 * ferait huit tableaux quasi identiques qui divergeraient au premier
 * ajustement de style.
 */

export interface ColonneHistorique<T> {
  entete: string;
  rendu: (ligne: T) => ReactNode;
  /** Les montants et les quantités se lisent alignés à droite. */
  droite?: boolean;
}

export function Historique<T extends { id: string }>({ titre, lignes, colonnes, vide }: {
  titre: string;
  lignes: T[];
  colonnes: ColonneHistorique<T>[];
  vide: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{titre}</h2>
      {lignes.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-border bg-card px-4 py-6 text-center">
          {vide}
        </p>
      ) : (
        <TableConteneur dense>
          <table className="w-full text-sm">
            <thead>
              <tr>
                {colonnes.map((c) => (
                  <th
                    key={c.entete}
                    className={`px-4 py-2.5 font-medium ${c.droite ? 'text-right' : 'text-left'}`}
                  >
                    {c.entete}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  {colonnes.map((c) => (
                    <td
                      key={c.entete}
                      className={`px-4 py-2.5 whitespace-nowrap ${c.droite ? 'text-right' : ''}`}
                    >
                      {c.rendu(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableConteneur>
      )}
    </div>
  );
}

/**
 * Bandeau de chiffres clés d'une fiche tiers.
 *
 * Il dessinait ses propres cartes — un libellé à douze pixels, un montant à
 * seize en gras, seize de rembourrage — et se retrouvait donc à côté des cartes
 * d'indicateur du tableau de bord sans leur ressembler : deux objets qui
 * répondent à la même question, avec deux hauteurs, deux tailles de valeur et
 * deux façons d'écrire le libellé.
 *
 * Il passe par `KpiCard`, sans pastille : quatre montants d'un même client — CA
 * facturé, encaissé, encours, dont échu — n'ont pas d'icône qui les distingue,
 * et quatre pastilles identiques ne feraient qu'occuper la place du chiffre.
 *
 * `alerte` met la valeur en rouge, et seulement si elle est non nulle : « 0,00
 * DA » en rouge annonce un problème qui n'existe pas.
 */
export function Chiffres({ items }: {
  items: { libelle: string; montant: number; alerte?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ libelle, montant, alerte }) => (
        <KpiCard
          key={libelle}
          titre={libelle}
          valeur={formatCurrency(montant)}
          alerte={alerte && montant > 0}
        />
      ))}
    </div>
  );
}
