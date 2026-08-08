/**
 * Teinte de filière.
 *
 * Vingt entrées de navigation en gris, réparties en cinq métiers, se lisent
 * comme une liste de courses : on relit le libellé à chaque fois parce que
 * rien ne distingue « Avoirs » de « Achats » avant d'avoir lu le mot. La
 * couleur fait ce travail plus vite que le texte — à condition qu'elle veuille
 * dire quelque chose de stable.
 *
 * Ici elle dit le **métier**, pas l'état :
 *
 * - `ventes` — azur, la couleur de la marque : c'est le cœur du produit ;
 * - `catalogue` — sarcelle : ce qu'on stocke, ce qui est froid, ce qui dort ;
 * - `achats` — violet : le miroir des ventes, de l'autre côté du comptoir ;
 * - `production` — ambre : la seule filière qui transforme, la seule chaude ;
 * - `finance` — magenta : ce qui compte les autres.
 *
 * Ces cinq teintes sont exactement cinq des six familles de séries des
 * graphiques (voir `globals.css`) : l'application n'a qu'un alphabet de
 * couleurs, appris une fois.
 *
 * **Ce que la teinte de filière ne fait jamais** : porter un état. Vert, orange
 * et rouge restent la propriété des statuts. Une facture en retard est rouge
 * qu'elle soit dans la filière ventes ou ailleurs.
 *
 * Les classes sont écrites en toutes lettres — jamais construites par
 * concaténation — parce que Tailwind lit ce fichier comme du texte : une
 * classe formée à l'exécution n'existerait pas dans la feuille de style.
 */
export type Filiere = 'ventes' | 'catalogue' | 'achats' | 'production' | 'finance';

interface TeinteFiliere {
  /** Couleur pleine : icône active, barre d'onglet, point de repère. */
  texte: string;
  /** Fond ténu : pastille d'icône, ligne de navigation active. */
  fond: string;
  /** Couleur pleine en fond : barre indicatrice de l'élément actif. */
  barre: string;
  /** Dégradé court, pour les pastilles d'indicateur du tableau de bord. */
  degrade: string;
  /** Anneau intérieur de la pastille : sans lui, un fond ténu se dissout. */
  anneau: string;
}

const TEINTES: Record<Filiere, TeinteFiliere> = {
  ventes: {
    texte: 'text-filiere-ventes',
    fond: 'bg-filiere-ventes-subtle',
    barre: 'bg-filiere-ventes',
    degrade: 'from-filiere-ventes/25 to-filiere-ventes/5',
    anneau: 'ring-filiere-ventes/30',
  },
  catalogue: {
    texte: 'text-filiere-catalogue',
    fond: 'bg-filiere-catalogue-subtle',
    barre: 'bg-filiere-catalogue',
    degrade: 'from-filiere-catalogue/25 to-filiere-catalogue/5',
    anneau: 'ring-filiere-catalogue/30',
  },
  achats: {
    texte: 'text-filiere-achats',
    fond: 'bg-filiere-achats-subtle',
    barre: 'bg-filiere-achats',
    degrade: 'from-filiere-achats/25 to-filiere-achats/5',
    anneau: 'ring-filiere-achats/30',
  },
  production: {
    texte: 'text-filiere-production',
    fond: 'bg-filiere-production-subtle',
    barre: 'bg-filiere-production',
    degrade: 'from-filiere-production/25 to-filiere-production/5',
    anneau: 'ring-filiere-production/30',
  },
  finance: {
    texte: 'text-filiere-finance',
    fond: 'bg-filiere-finance-subtle',
    barre: 'bg-filiere-finance',
    degrade: 'from-filiere-finance/25 to-filiere-finance/5',
    anneau: 'ring-filiere-finance/30',
  },
};

export function teinteFiliere(filiere: Filiere): TeinteFiliere {
  return TEINTES[filiere];
}

/**
 * Couleurs de série, dans l'ordre figé validé sous protanopie et
 * deutéranopie. L'index vient de l'**entité** — la position d'un mode de
 * règlement dans sa liste de référence, pas son rang du mois — pour qu'un mois
 * sans chèques ne repeigne pas les espèces.
 */
export const CLASSES_SERIE = [
  'text-serie-1', 'text-serie-2', 'text-serie-3',
  'text-serie-4', 'text-serie-5', 'text-serie-6',
] as const;

export const FONDS_SERIE = [
  'bg-serie-1', 'bg-serie-2', 'bg-serie-3',
  'bg-serie-4', 'bg-serie-5', 'bg-serie-6',
] as const;

/** Variable CSS de la série, pour les dégradés SVG qui ne prennent pas de classe. */
export const VARIABLES_SERIE = [
  '--ci-serie-1', '--ci-serie-2', '--ci-serie-3',
  '--ci-serie-4', '--ci-serie-5', '--ci-serie-6',
] as const;

/**
 * Une entité reçoit toujours le même créneau, quel que soit son rang. Le
 * modulo n'est pas un recyclage de couleurs pour cinquante séries — au-delà de
 * six entités on ne colore plus, on classe : les listes de rang gardent la
 * teinte unique de la filière.
 */
export function creneauSerie(index: number): number {
  return ((index % 6) + 6) % 6;
}

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
