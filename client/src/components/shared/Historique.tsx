import { ReactNode } from 'react';
import { formatCurrency } from '@/lib/utils';

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
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
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
        </div>
      )}
    </div>
  );
}

/**
 * Bandeau de chiffres clés. `alerte` met la valeur en rouge — réservé à ce
 * qui appelle une action : un encours échu, une dette en retard.
 */
export function Chiffres({ items }: {
  items: { libelle: string; montant: number; alerte?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ libelle, montant, alerte }) => (
        <div key={libelle} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{libelle}</p>
          <p className={`text-lg font-bold ${alerte && montant > 0 ? 'text-destructive' : 'text-foreground'}`}>
            {formatCurrency(montant)}
          </p>
        </div>
      ))}
    </div>
  );
}
