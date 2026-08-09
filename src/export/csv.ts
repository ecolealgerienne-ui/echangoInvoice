/**
 * Sérialisation CSV.
 *
 * Deux dialectes, parce qu'un seul fichier ne peut pas servir les deux usages.
 * Excel en français découpe sur le point-virgule et lit la virgule comme
 * séparateur décimal : un fichier séparé par des virgules avec des décimales
 * à point s'ouvre en UNE seule colonne, et l'utilisateur conclut que l'export
 * est cassé. À l'inverse, tout ce qui relit le fichier par programme (Python,
 * un import bancaire, un autre logiciel) attend la virgule et le point.
 *
 * Le dialecte « fr » est la valeur par défaut : la personne qui clique sur
 * « Exporter » ouvre le fichier, elle ne le parse pas.
 */

export type Dialecte = 'fr' | 'intl';

export type TypeColonne = 'texte' | 'nombre' | 'date' | 'horodatage' | 'booleen' | 'enum';

export interface Colonne {
  /** Alias de la colonne dans le SELECT. */
  cle: string;
  /** En-tête écrit dans le fichier. */
  libelle: string;
  type: TypeColonne;
  /** Traduction des valeurs, pour le type « enum » uniquement. */
  valeurs?: Record<string, string>;
}

interface Format {
  separateur: string;
  decimale: string;
  dateJourEnTete: boolean;
  vrai: string;
  faux: string;
}

const FORMATS: Record<Dialecte, Format> = {
  fr: { separateur: ';', decimale: ',', dateJourEnTete: true, vrai: 'Oui', faux: 'Non' },
  intl: { separateur: ',', decimale: '.', dateJourEnTete: false, vrai: 'true', faux: 'false' },
};

/**
 * Excel évalue toute cellule commençant par =, +, - ou @ comme une formule.
 * Les noms de clients, les libellés d'articles et les notes sont saisis par
 * l'utilisateur : rien n'empêche « =1+1 », ni une formule qui appelle une URL
 * externe. On préfixe d'une apostrophe, qu'Excel consomme à l'affichage.
 *
 * Seules les colonnes de texte passent par là : un montant négatif commence
 * par un signe moins et doit rester un nombre, pas devenir « '-150,00 ».
 */
const DEBUT_DANGEREUX = /^[=+\-@\t\r]/;

function echapper(valeur: string, separateur: string): string {
  if (valeur.includes(separateur) || valeur.includes('"') || /[\r\n]/.test(valeur)) {
    return `"${valeur.replace(/"/g, '""')}"`;
  }
  return valeur;
}

function isoVersJour(iso: string, fmt: Format): string {
  if (!fmt.dateJourEnTete) return iso;
  // « 2026-05-10 » ou « 2026-05-10 14:32 » — on ne retourne que la partie date.
  const [date, heure] = iso.split(' ');
  const [a, m, j] = date.split('-');
  if (!a || !m || !j) return iso;
  return heure ? `${j}/${m}/${a} ${heure}` : `${j}/${m}/${a}`;
}

function cellule(brut: unknown, colonne: Colonne, fmt: Format): string {
  if (brut === null || brut === undefined) return '';

  switch (colonne.type) {
    case 'nombre': {
      // Le pilote pg rend les `numeric` sous forme de chaîne : on ne les
      // convertit jamais en flottant, ce qui perdrait des centimes sur les
      // montants. On se contente de changer le séparateur décimal.
      const texte = String(brut);
      return fmt.decimale === ',' ? texte.replace('.', ',') : texte;
    }
    case 'date':
    case 'horodatage':
      return echapper(isoVersJour(String(brut), fmt), fmt.separateur);
    case 'booleen':
      return brut ? fmt.vrai : fmt.faux;
    case 'enum': {
      const cle = String(brut);
      // Une valeur non traduite est écrite telle quelle : mieux vaut un statut
      // en anglais qu'une cellule vide qui laisserait croire qu'il n'y en a pas.
      return echapper(colonne.valeurs?.[cle] ?? cle, fmt.separateur);
    }
    default: {
      const texte = String(brut);
      const sur = DEBUT_DANGEREUX.test(texte) ? `'${texte}` : texte;
      return echapper(sur, fmt.separateur);
    }
  }
}

export function enTete(colonnes: Colonne[], dialecte: Dialecte): string {
  const fmt = FORMATS[dialecte];
  return colonnes.map((c) => echapper(c.libelle, fmt.separateur)).join(fmt.separateur) + '\r\n';
}

export function ligne(
  enregistrement: Record<string, unknown>,
  colonnes: Colonne[],
  dialecte: Dialecte,
): string {
  const fmt = FORMATS[dialecte];
  return colonnes.map((c) => cellule(enregistrement[c.cle], c, fmt)).join(fmt.separateur) + '\r\n';
}

/**
 * Sans cette marque, Excel lit le fichier dans la page de codes du système et
 * « Réglé » devient « RÃ©glÃ© ». Les fins de ligne sont en CRLF pour la même
 * raison : c'est ce qu'attendent les tableurs sous Windows.
 *
 * Écrit sous forme d'échappement et non de caractère littéral : la marque est
 * invisible dans un éditeur, et un copier-coller malheureux la ferait
 * disparaître du fichier source sans que rien ne le signale.
 */
export const BOM = String.fromCharCode(0xfeff);
