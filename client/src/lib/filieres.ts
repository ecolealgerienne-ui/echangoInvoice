/**
 * L'alphabet de couleurs de l'application.
 *
 * ── Ce que ce fichier ne fait plus ───────────────────────────────────────
 *
 * Il portait aussi les **teintes de filière** : cinq métiers — ventes,
 * catalogue, achats, production, finance — et pour chacun une couleur pleine,
 * un fond ténu, une barre, un dégradé, un anneau. Ces vingt-cinq classes
 * coloraient la barre latérale et les pastilles du tableau de bord.
 *
 * La spécification les retire de la navigation : la barre latérale n'a plus
 * qu'un seul aplat coloré, l'entrée active. Et les pastilles d'indicateur
 * reçoivent leur ton du composant `KpiCard`, qui en connaît cinq — c'est le
 * même vocabulaire, mais il est décidé là où l'on décide de la carte, et non
 * dérivé d'un métier. `teinteFiliere` n'avait donc plus un seul appelant, et
 * les jetons `--ci-filiere-*` qui restent dans `globals.css` ne servent plus
 * qu'à nourrir ces tons.
 *
 * Ce qui reste ici, ce sont les **séries** — six familles, un ordre figé —
 * parce que les graphiques et les pastilles d'initiales en ont besoin sous une
 * forme utilisable dans un attribut SVG, ce qu'une classe Tailwind ne donne
 * pas.
 */

/**
 * Une entité reçoit toujours le même créneau, quel que soit son rang. Le
 * modulo n'est pas un recyclage de couleurs pour cinquante séries — au-delà de
 * six entités on ne colore plus, on classe : les listes de rang gardent la
 * teinte unique de la série demandée.
 */
export function creneauSerie(index: number): number {
  return ((index % 6) + 6) % 6;
}

/** Variable CSS de la série, pour les dégradés SVG qui ne prennent pas de classe. */
const VARIABLES_SERIE = [
  '--ci-serie-1', '--ci-serie-2', '--ci-serie-3',
  '--ci-serie-4', '--ci-serie-5', '--ci-serie-6',
] as const;

/**
 * Couleur d'un créneau de série, prête à poser dans un attribut SVG ou un
 * style en ligne. Elle vit ici et non dans `Graphique.tsx` parce que la
 * pastille d'initiales d'un client s'en sert sans rien tracer.
 */
export function couleurSerie(creneau: number, alpha?: number): string {
  const variable = VARIABLES_SERIE[creneauSerie(creneau)];
  return alpha === undefined ? `oklch(var(${variable}))` : `oklch(var(${variable}) / ${alpha})`;
}

/**
 * Créneau tiré d'un nom.
 *
 * Une pastille d'initiales n'a de valeur que si elle est **stable** : « EURL
 * Hoggar Grossiste » doit garder sa teinte d'une page à l'autre, d'un tri à
 * l'autre, d'une session à l'autre. Un index de ligne ne le garantit pas — il
 * repeindrait toute la liste au moindre changement d'ordre.
 *
 * Le calcul est un FNV-1a sur trente-deux bits : suffisant pour disperser des
 * noms qui partagent souvent leurs premières lettres (« ETS … », « SARL … »),
 * et assez court pour tenir en cinq lignes sans dépendance.
 */
export function creneauNom(nom: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < nom.length; i += 1) {
    h ^= nom.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return creneauSerie(h >>> 0);
}
