import { DataSource } from 'typeorm';

/**
 * Complète des lignes de document avec le code et le nom de leur article.
 *
 * Les lignes ne stockent que `finishedProductId` : sans cette résolution, une
 * facture consultée n'affiche que des identifiants. Les écrans de saisie s'en
 * tiraient jusqu'ici en chargeant les 200 premiers articles du catalogue et en
 * faisant la correspondance côté client — ce qui laisse sans nom toute ligne
 * portant sur le 201ᵉ article.
 *
 * Les articles supprimés sont inclus (`deletedAt` n'est pas filtré) : un
 * document émis reste la trace d'une vente, et effacer un article du catalogue
 * ne doit pas vider les factures passées de leur contenu.
 *
 * Limite connue et assumée : le nom n'est pas figé au moment de l'émission. Un
 * article renommé change rétroactivement le libellé des anciens documents.
 * Le PDF déjà envoyé au client, lui, ne bouge pas — c'est lui qui fait foi.
 */
// `object` et non `Record<string, unknown>` : les lignes arrivent sous forme
// d'instances d'entités TypeORM, qu'un index signature n'accepte pas.
export async function ajouterArticles<T extends object>(
  dataSource: DataSource,
  lignes: T[],
  tenantId: string,
  // Les lignes d'achat désignent l'article par `rawMaterialId`, celles de
  // vente par `finishedProductId` — deux noms hérités pour la même clé
  // étrangère vers `finished_products`.
  cle: string = 'finishedProductId',
): Promise<(T & { productCode: string | null; productName: string | null })[]> {
  const idDe = (l: T) => (l as Record<string, unknown>)[cle] as string | null | undefined;
  const ids = [...new Set(lignes.map(idDe).filter(Boolean))];
  if (ids.length === 0) {
    return lignes.map((l) => ({ ...l, productCode: null, productName: null }));
  }

  const articles: { id: string; code: string; name: string }[] = await dataSource.query(
    `SELECT id, code, name FROM finished_products WHERE id = ANY($1) AND "tenantId" = $2`,
    [ids, tenantId],
  );
  const parId = new Map(articles.map((a) => [a.id, a]));

  return lignes.map((l) => {
    const id = idDe(l);
    const article = id ? parId.get(id) : undefined;
    return { ...l, productCode: article?.code ?? null, productName: article?.name ?? null };
  });
}
