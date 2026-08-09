/**
 * La langue de l'interface, et le traducteur qui la suit — mode **M6**.
 *
 * ── Le défaut que ce fichier existe pour fermer ──────────────────────────────
 *
 * Les vingt-quatre fichiers de cette suite désignaient leurs cibles par leur
 * **libellé français** :
 *
 *     page.getByRole('button', { name: /nouvelle facture/i })
 *
 * L'application est bilingue depuis. En arabe, ce test échoue en annonçant que
 * le bouton n'existe pas — **pour une raison sans aucun rapport avec un
 * défaut**. Un test qui ment sur la cause de son échec est pire qu'un test
 * absent : il envoie chercher au mauvais endroit.
 *
 * ── Pourquoi le traducteur plutôt que `data-testid` partout ─────────────────
 *
 * `METHODE_TEST.md` M6 prescrit de désigner les éléments par ce qu'ils **sont**
 * et non par ce qu'ils **disent**, et nomme l'exception :
 *
 *     « quand la distinction testée EST une différence de texte — se traite en
 *       calculant les deux attendus par le traducteur de l'application. »
 *
 * Pour un bouton, le libellé **est** ce qui le désigne à l'utilisateur. Le
 * chercher par sa clé de traduction a trois vertus qu'un `data-testid` n'a
 * pas :
 *
 *   · le test suit la langue sans être réécrit ;
 *   · il lit le **même catalogue** que l'application — pas une copie ;
 *   · si quelqu'un change la clé employée par l'écran, le test rougit. C'est
 *     un couplage souhaitable : la clé fait partie du contrat.
 *
 * `data-testid` reste le bon outil pour ce qui n'a pas de libellé — une ligne
 * de tableau, un conteneur, un état de chargement.
 *
 * ── Le repli, identique à celui de l'application ────────────────────────────
 *
 * `createI18n` pose `fallbackLng: 'fr'` : une clé absente de l'arabe s'affiche
 * en français. Ce traducteur fait exactement pareil — sinon il chercherait un
 * texte arabe que l'écran n'affiche pas, et le test échouerait sur une
 * traduction manquante en accusant l'écran.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *     LANGUE=ar npx playwright test        # la suite en arabe
 *     npx playwright test                  # en français (défaut)
 */
import * as fs from 'fs';
import * as path from 'path';

export type Langue = 'fr' | 'ar';

export const LANGUE: Langue = process.env.LANGUE === 'ar' ? 'ar' : 'fr';

/** La clé de `localStorage` que lit `langueInitiale()` — shared/src/i18n. */
export const CLE_STOCKAGE = 'langue';

const RACINE_I18N = path.join(__dirname, '..', '..', 'shared', 'src', 'i18n');

// ⚠️ Lus sur le disque, pas importés. Le catalogue de l'application est la
// seule source : en recopier ne serait-ce qu'une entrée ferait diverger le test
// de l'écran sans que rien ne le signale (M2).
function catalogue(langue: Langue): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(RACINE_I18N, `${langue}.json`), 'utf-8'));
}

const CATALOGUES: Record<Langue, Record<string, unknown>> = {
  fr: catalogue('fr'),
  ar: catalogue('ar'),
};

function lire(objet: Record<string, unknown>, cle: string): string | undefined {
  let courant: unknown = objet;
  for (const morceau of cle.split('.')) {
    if (typeof courant !== 'object' || courant === null) return undefined;
    courant = (courant as Record<string, unknown>)[morceau];
  }
  return typeof courant === 'string' ? courant : undefined;
}

/**
 * Le libellé que l'écran affiche, dans la langue du passage.
 *
 * ⚠️ Lève quand la clé n'existe dans **aucune** des deux langues. C'est
 * délibéré : un `t()` qui rendrait la clé elle-même ferait chercher le texte
 * « invoices.new » à l'écran, et le test échouerait en annonçant que le bouton
 * n'existe pas — le mode M6 déplacé d'un cran, pas corrigé.
 */
export function t(cle: string): string {
  const dans_la_langue = lire(CATALOGUES[LANGUE], cle);
  if (dans_la_langue !== undefined) return dans_la_langue;

  const repli = lire(CATALOGUES.fr, cle);
  if (repli !== undefined) return repli;

  throw new Error(
    `Clé de traduction inconnue : « ${cle} ». Elle n'est ni dans fr.json ni ` +
    `dans ar.json — le test chercherait un texte que l'écran n'affiche nulle part.`,
  );
}

/** Le libellé, en expression régulière ancrée et échappée. */
export function tRegex(cle: string): RegExp {
  const texte = t(cle);
  return new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** Sens d'écriture attendu — l'arabe passe la page en `dir="rtl"`. */
export const SENS: Record<Langue, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };
