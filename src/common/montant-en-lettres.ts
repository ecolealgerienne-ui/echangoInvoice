/**
 * Montant en toutes lettres.
 *
 * Mention obligatoire du décret 05-468, absente jusqu'ici — voir
 * `docs/CONFORMITE-FISCALE.md` §7, qui la classe deuxième écart par valeur sur
 * effort : sanction de 10 000 à 50 000 DA (loi 04-02, art. 34) pour une
 * fonction de conversion.
 *
 * Les règles d'accord qui piègent, et qu'aucune erreur d'exécution ne
 * signalerait — une facture au pluriel fautif s'imprime, s'envoie et se paie :
 *   - `cent` prend un s quand il est multiplié ET final : « deux cents », mais
 *     « deux cent un » ;
 *   - `vingt` de même : « quatre-vingts », mais « quatre-vingt-un » ;
 *   - `mille` est un adjectif numéral, invariable, et fait tomber le s du mot
 *     qui le précède : « quatre-vingt mille », « deux cent mille » ;
 *   - `million` et `milliard` sont des noms : le s reste devant eux —
 *     « quatre-vingts millions », « deux cents millions ».
 */

const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];

const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', ''];

/** 0–99. `suiviDeMille` fait tomber le s de « quatre-vingts ». */
function deuxChiffres(n: number, suiviDeMille = false): string {
  if (n < 20) return UNITES[n];

  const d = Math.floor(n / 10);
  const u = n % 10;

  // 70–79 et 90–99 se construisent sur 60 et 80, avec les nombres 10–19.
  if (d === 7 || d === 9) {
    const base = DIZAINES[d - 1];
    // 71 seul garde le « et » : soixante et onze. 91 = quatre-vingt-onze.
    if (d === 7 && u === 1) return `${base} et ${UNITES[11]}`;
    return `${base}-${UNITES[10 + u]}`;
  }

  const base = DIZAINES[d];
  if (u === 0) return d === 8 && !suiviDeMille ? `${base}s` : base;
  if (u === 1 && d !== 8) return `${base} et un`;
  return `${base}-${UNITES[u]}`;
}

/** 0–999. `suiviDeMille` fait tomber le s de « cents ». */
function troisChiffres(n: number, suiviDeMille = false): string {
  const c = Math.floor(n / 100);
  const r = n % 100;

  if (c === 0) return deuxChiffres(r, suiviDeMille);
  if (c === 1) return r === 0 ? 'cent' : `cent ${deuxChiffres(r, suiviDeMille)}`;

  if (r === 0) return suiviDeMille ? `${UNITES[c]} cent` : `${UNITES[c]} cents`;
  return `${UNITES[c]} cent ${deuxChiffres(r, suiviDeMille)}`;
}

const ECHELLES = [
  { singulier: '', pluriel: '' },
  { singulier: 'mille', pluriel: 'mille' },        // invariable
  { singulier: 'million', pluriel: 'millions' },
  { singulier: 'milliard', pluriel: 'milliards' },
  { singulier: 'billion', pluriel: 'billions' },
];

export function entierEnLettres(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new RangeError('entierEnLettres: entier positif fini attendu');
  n = Math.floor(n);
  if (n === 0) return 'zéro';

  const tranches: number[] = [];
  let reste = n;
  while (reste > 0) {
    tranches.push(reste % 1000);
    reste = Math.floor(reste / 1000);
  }
  if (tranches.length > ECHELLES.length) {
    throw new RangeError('entierEnLettres: montant hors échelle');
  }

  const morceaux: string[] = [];
  for (let i = tranches.length - 1; i >= 0; i--) {
    const valeur = tranches[i];
    if (valeur === 0) continue;

    if (i === 0) {
      morceaux.push(troisChiffres(valeur));
    } else if (i === 1) {
      // « mille », jamais « un mille ».
      morceaux.push(valeur === 1 ? 'mille' : `${troisChiffres(valeur, true)} mille`);
    } else {
      const e = ECHELLES[i];
      morceaux.push(`${troisChiffres(valeur)} ${valeur > 1 ? e.pluriel : e.singulier}`);
    }
  }

  return morceaux.join(' ');
}

/**
 * Montant monétaire en toutes lettres, pour le pied des factures et des avoirs.
 *
 * Arrondi au centime, jamais tronqué : un `129.999` issu d'un calcul flottant
 * doit s'écrire « cent trente dinars », pas « cent vingt-neuf ».
 */
export function montantEnLettres(
  valeurBrute: number | string,
  devise = { singulier: 'dinar algérien', pluriel: 'dinars algériens', centimes: 'centimes' },
): string {
  const valeur = Number(valeurBrute);
  if (!Number.isFinite(valeur)) throw new RangeError('montantEnLettres: montant non fini');
  if (valeur < 0) return `moins ${montantEnLettres(-valeur, devise)}`;

  const totalCentimes = Math.round(valeur * 100);
  const entiers = Math.floor(totalCentimes / 100);
  const centimes = totalCentimes % 100;

  let texte = `${entierEnLettres(entiers)} ${entiers > 1 ? devise.pluriel : devise.singulier}`;
  if (centimes > 0) texte += ` et ${entierEnLettres(centimes)} ${devise.centimes}`;
  return texte;
}
