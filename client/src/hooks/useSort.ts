import { useState } from 'react';

export type SensTri = 'ASC' | 'DESC';

/**
 * Tri d'une liste paginée.
 *
 * Le tri est **serveur**, pas navigateur : les listes sont paginées, trier les
 * vingt lignes affichées donnerait un tableau qui a l'air trié et ne l'est pas.
 * Le hook ne fait donc que porter l'état et le rendre au client d'API.
 *
 * La préférence est mémorisée comme celle des colonnes visibles
 * (`useColumnVisibility`), avec la même forme de clé.
 */
export function useSort<T extends string>(
  storageKey: string,
  defaut: { sortBy: T; sortOrder: SensTri },
) {
  const [tri, setTri] = useState<{ sortBy: T; sortOrder: SensTri }>(() => {
    try {
      const brut = localStorage.getItem(storageKey);
      if (brut) return JSON.parse(brut) as { sortBy: T; sortOrder: SensTri };
    } catch { /* préférence illisible : on repart du défaut */ }
    return defaut;
  });

  /**
   * Un clic sur la colonne déjà triée inverse le sens ; sur une autre colonne,
   * il repart en ASC — l'ordre d'une nouvelle colonne n'a pas de raison
   * d'hériter du sens de la précédente.
   */
  function trierPar(colonne: T) {
    setTri((prec) => {
      const suivant: { sortBy: T; sortOrder: SensTri } =
        prec.sortBy === colonne
          ? { sortBy: colonne, sortOrder: prec.sortOrder === 'ASC' ? 'DESC' : 'ASC' }
          : { sortBy: colonne, sortOrder: 'ASC' };
      localStorage.setItem(storageKey, JSON.stringify(suivant));
      return suivant;
    });
  }

  /** Valeur d'`aria-sort` pour l'en-tête, lue par les lecteurs d'écran. */
  function ariaSort(colonne: T): 'ascending' | 'descending' | 'none' {
    if (tri.sortBy !== colonne) return 'none';
    return tri.sortOrder === 'ASC' ? 'ascending' : 'descending';
  }

  return { tri, trierPar, ariaSort };
}
