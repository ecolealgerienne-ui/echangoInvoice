/**
 * Montants abrégés.
 *
 * Une carte d'indicateur et un tableau ne posent pas la même question.
 *
 * Le tableau pose « combien exactement ? » — on y vient lire le solde d'une
 * facture pour le rapprocher d'un virement, et `20 409 086,29 DA` est la
 * réponse. **Rien de ce fichier n'a sa place dans une colonne de tableau.**
 *
 * La carte d'indicateur pose « quel ordre de grandeur ? ». Écrit en entier, le
 * chiffre d'affaires occupait deux lignes, cassait l'alignement des quatre
 * cartes de la rangée, et se lisait chiffre par chiffre — personne ne compte
 * les groupes de trois pour savoir s'il est question de vingt millions ou de
 * deux cents. `20,4 M DA` se lit d'un coup, et le montant exact reste à un
 * survol.
 *
 * La fonction vivait dans `Graphique.tsx`, où elle ne servait qu'aux
 * graduations d'axe. Elle est ici parce que trois écrans en ont besoin et
 * qu'une deuxième copie aurait divergé au premier ajustement.
 *
 * ── Le nombre de décimales ────────────────────────────────────────────────
 *
 * Un seul chiffre après la virgule sur une carte : elle annonce, elle ne
 * compare pas. Deux dans la légende d'un graphique de répartition, où l'on met
 * précisément les parts en regard les unes des autres et où `5,4 M` contre
 * `5,4 M` ne dirait plus laquelle domine.
 *
 * Le palier des milliers n'en prend jamais : `776,34 k` est une précision
 * absurde — moins lisible que `776 k` sans rien apprendre de plus.
 */

/** Séparateur décimal français : la virgule, jamais le point. */
const virgule = (s: string) => s.replace('.', ',');

/**
 * Ordre de grandeur d'un nombre nu, sans unité monétaire.
 *
 * Sert aux graduations d'axe, où l'unité est déjà annoncée ailleurs.
 */
export function abrege(v: number, decimales = 1): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${virgule((v / 1e9).toFixed(decimales))} Md`;
  if (abs >= 1e6) return `${virgule((v / 1e6).toFixed(decimales))} M`;
  if (abs >= 1e3) return `${Math.round(v / 1e3)} k`;
  return String(Math.round(v));
}

/** Le même, suffixé de la monnaie : `20,4 M DA`. */
export function montantAbrege(v: number | string | null | undefined, decimales = 1): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return '—';
  return `${abrege(n, decimales)} DA`;
}

/**
 * Part d'un tout, en pourcentage français — espace insécable avant le signe.
 *
 * Rend une chaîne vide quand le total est nul : « 0 % » d'un ensemble vide se
 * lirait comme une part réellement nulle.
 */
export function pourcentage(valeur: number, total: number, decimales = 1): string {
  if (!Number.isFinite(valeur) || !Number.isFinite(total) || total <= 0) return '';
  return `${virgule(((valeur / total) * 100).toFixed(decimales))} %`;
}

/**
 * Écart signé, en pourcentage : `+14,1 %`, `−4,3 %`.
 *
 * Le serveur rend un nombre JavaScript, dont le point décimal s'écrivait tel
 * quel à côté d'espaces insécables et de milliers groupés à la française : le
 * tableau de bord affichait `+14.1 %` sous des montants en `20 409 086,29`.
 * Le signe « plus » est explicite — sans lui, une hausse et une baisse ne se
 * distinguent que par un tiret, et le regard le rate.
 */
export function ecartPourcent(v: number): string {
  return `${v > 0 ? '+' : ''}${virgule(String(v))} %`;
}

/**
 * Entier groupé à la française : `1 248`.
 *
 * `formatNumber` impose deux décimales — utile pour une quantité, absurde pour
 * un nombre de lignes.
 */
export function formatEntier(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }).format(num);
}
