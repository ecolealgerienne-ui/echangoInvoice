import { BadRequestException } from '@nestjs/common';

export type SensTri = 'ASC' | 'DESC';

/**
 * Tri des listes.
 *
 * Une colonne de tri est un fragment de SQL : elle ne peut pas venir du client
 * sans être confrontée à une liste blanche. La liste vit **à côté du service
 * qui l'utilise**, jamais dans le DTO — sinon deux endroits devraient s'accorder
 * sur les colonnes réellement triables (R029).
 *
 * Une colonne inconnue lève un 400 plutôt que de retomber sur le tri par
 * défaut : un repli silencieux afficherait un tableau qui a l'air trié et ne
 * l'est pas, et personne ne remonterait le défaut.
 */
export function resoudreTri<T extends string>(
  colonnesAutorisees: readonly T[],
  defaut: { colonne: T; sens: SensTri },
  demande?: { sortBy?: string; sortOrder?: string },
): Record<string, SensTri> {
  const sens: SensTri = (demande?.sortOrder ?? '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  if (!demande?.sortBy) {
    return { [defaut.colonne]: defaut.sens };
  }

  if (!(colonnesAutorisees as readonly string[]).includes(demande.sortBy)) {
    throw new BadRequestException({
      message: 'errors.invalid_sort_column',
      field: 'sortBy',
      allowed: colonnesAutorisees,
    });
  }

  return { [demande.sortBy]: sens };
}

/**
 * Variante pour les requêtes SQL écrites à la main : rend un fragment
 * `ORDER BY` déjà validé. La colonne est entre guillemets doubles parce que le
 * schéma est en camelCase.
 */
export function fragmentOrderBy<T extends string>(
  colonnesAutorisees: readonly T[],
  defaut: { colonne: T; sens: SensTri },
  demande?: { sortBy?: string; sortOrder?: string },
  prefixe = '',
): string {
  const ordre = resoudreTri(colonnesAutorisees, defaut, demande);
  const [colonne, sens] = Object.entries(ordre)[0];
  return `ORDER BY ${prefixe}"${colonne}" ${sens}`;
}

/** Variante QueryBuilder : `alias.colonne`, une seule clause de tri. */
export function appliquerTri<T extends string>(
  qb: { orderBy(sort: string, order: SensTri): unknown },
  alias: string,
  colonnesAutorisees: readonly T[],
  defaut: { colonne: T; sens: SensTri },
  demande?: { sortBy?: string; sortOrder?: string },
): void {
  const ordre = resoudreTri(colonnesAutorisees, defaut, demande);
  const [colonne, sens] = Object.entries(ordre)[0];
  qb.orderBy(`${alias}.${colonne}`, sens);
}
