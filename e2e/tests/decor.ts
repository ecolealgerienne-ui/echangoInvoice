/**
 * Le décor, lu par les parcours écran — mode **M8**.
 *
 * ── Pourquoi les tests d'écran lisent le même manifeste que les bancs ───────
 *
 * `scripts/provision-decor.sh` pose ce qu'un test ne peut pas poser lui-même,
 * et l'écrit dans `.decor/manifeste.json`. Les bancs HTTP le lisent depuis le
 * début. Rien ne justifiait que l'étage 4 s'en prive : c'est le **même** décor,
 * et deux sources de vérité finiraient par diverger.
 *
 * ── Le défaut que cela ferme ────────────────────────────────────────────────
 *
 * Un test cherchait « une facture issue d'un BL » **sur la première page** de
 * la liste des factures. Les tests qui tournaient avant lui en créaient assez
 * pour l'en chasser : il passait seul, échouait après les autres.
 *
 *     M7 — ce qui n'est pas rendu n'existe pas : la liste rend vingt lignes.
 *     M8 — deux tests qui se passent un état échouent ensemble, et le second
 *          accuse le premier.
 *
 * Le remède est celui que la méthode prescrit : **filtrer par la recherche
 * plutôt que défiler**. Elle interroge le serveur, et la pagination disparaît
 * du problème. Encore faut-il savoir quoi chercher — c'est ce que le manifeste
 * apporte.
 *
 * ⚠️ Absent, il **arrête** le test au lieu de le laisser chercher au hasard.
 * Un décor manquant qui se déguise en test qui échoue fait perdre une heure.
 */
import * as fs from 'fs';
import * as path from 'path';

const CHEMIN = path.join(__dirname, '..', '..', '.decor', 'manifeste.json');

export interface Decor {
  locataires: Record<string, { id: string; libelle: string }>;
  comptes: Record<string, Record<string, { email: string; motDePasse: string }>>;
  ressources: Record<string, Record<string, string>>;
  marque: string;
}

let cache: Decor | null = null;

export function decor(): Decor {
  if (cache) return cache;
  if (!fs.existsSync(CHEMIN)) {
    throw new Error(
      `Décor absent : ${CHEMIN}\n` +
      `   Lancer ./scripts/provision-decor.sh avant la suite. Sans lui, ces ` +
      `tests chercheraient des ressources qu'ils n'ont pas posées.`,
    );
  }
  cache = JSON.parse(fs.readFileSync(CHEMIN, 'utf-8')) as Decor;
  return cache;
}

/** Le locataire sur lequel tourne la suite écran — celui du jeu de démonstration. */
export const LOCATAIRE = process.env.LOCATAIRE_E2E ?? 'A';

/** Une ressource du décor, par sa clé. Lève si elle manque. */
export function ressource(cle: string): string {
  const valeur = decor().ressources[LOCATAIRE]?.[cle];
  if (!valeur) {
    throw new Error(
      `Le décor ne porte pas « ressources.${LOCATAIRE}.${cle} ». ` +
      `Rejouer ./scripts/provision-decor.sh.`,
    );
  }
  return valeur;
}

/** Le nom du client du décor — distinctif, et cherchable dans les listes. */
export function nomClientDecor(): string {
  return `${decor().marque}-${LOCATAIRE} Client`;
}
