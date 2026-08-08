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
export async function ajouterArticles<T extends { finishedProductId?: string | null }>(
  dataSource: DataSource,
  lignes: T[],
  tenantId: string,
): Promise<(T & { productCode: string | null; productName: string | null })[]> {
  const ids = [...new Set(lignes.map((l) => l.finishedProductId).filter(Boolean))];
  if (ids.length === 0) {
    return lignes.map((l) => ({ ...l, productCode: null, productName: null }));
  }

  const articles: { id: string; code: string; name: string }[] = await dataSource.query(
    `SELECT id, code, name FROM finished_products WHERE id = ANY($1) AND "tenantId" = $2`,
    [ids, tenantId],
  );
  const parId = new Map(articles.map((a) => [a.id, a]));

  return lignes.map((l) => {
    const article = l.finishedProductId ? parId.get(l.finishedProductId) : undefined;
    return { ...l, productCode: article?.code ?? null, productName: article?.name ?? null };
  });
}
