/**
 * Codes-barres : normalisation et clé de contrôle.
 *
 * Un code mal saisi ne provoque aucune erreur : il crée un article introuvable
 * au scan, et personne ne fait le lien entre les deux. La clé de contrôle des
 * familles EAN/UPC est justement là pour ça — l'utiliser à la saisie coûte
 * quelques lignes et supprime la classe entière de ces défauts.
 */

export type TypeCodeBarres = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128' | 'INTERNE';

/** Longueurs imposées, et donc contrôlables. `null` = format libre. */
const LONGUEURS: Record<TypeCodeBarres, number | null> = {
  EAN13: 13, EAN8: 8, UPCA: 12, CODE128: null, INTERNE: null,
};

/**
 * Une douchette peut émettre des espaces ou un retour chariot ; un utilisateur
 * qui recopie un code y met souvent des tirets.
 */
export function normaliserCodeBarres(brut: string): string {
  return brut.replace(/[\s -]/g, '').trim();
}

/**
 * Clé de contrôle EAN/UPC : somme pondérée 1/3 des chiffres de droite à gauche
 * en partant de l'avant-dernier, complétée à la dizaine supérieure.
 */
export function cleDeControle(chiffresSansCle: string): number {
  let somme = 0;
  const inverse = chiffresSansCle.split('').reverse();
  for (let i = 0; i < inverse.length; i++) {
    const n = Number(inverse[i]);
    somme += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (somme % 10)) % 10;
}

export interface Verdict {
  valide: boolean;
  /** Clé i18n quand le code est refusé. */
  raison?: string;
}

export function verifierCodeBarres(code: string, type: TypeCodeBarres): Verdict {
  const c = normaliserCodeBarres(code);

  if (!c) return { valide: false, raison: 'errors.barcode_empty' };
  if (c.length > 64) return { valide: false, raison: 'errors.barcode_too_long' };

  const longueur = LONGUEURS[type];
  if (longueur === null) {
    // CODE128 accepte l'ASCII imprimable ; INTERNE est libre par définition.
    return /^[\x20-\x7E]+$/.test(c)
      ? { valide: true }
      : { valide: false, raison: 'errors.barcode_invalid_characters' };
  }

  if (!/^\d+$/.test(c)) return { valide: false, raison: 'errors.barcode_digits_only' };
  if (c.length !== longueur) return { valide: false, raison: 'errors.barcode_wrong_length' };

  const attendue = cleDeControle(c.slice(0, -1));
  if (Number(c.slice(-1)) !== attendue) {
    return { valide: false, raison: 'errors.barcode_check_digit' };
  }
  return { valide: true };
}

/**
 * Devine le type d'un code d'après sa seule forme, pour éviter de le demander
 * à l'utilisateur quand il est déductible.
 */
export function deviserType(code: string): TypeCodeBarres {
  const c = normaliserCodeBarres(code);
  if (/^\d{13}$/.test(c) && verifierCodeBarres(c, 'EAN13').valide) return 'EAN13';
  if (/^\d{12}$/.test(c) && verifierCodeBarres(c, 'UPCA').valide) return 'UPCA';
  if (/^\d{8}$/.test(c) && verifierCodeBarres(c, 'EAN8').valide) return 'EAN8';
  return 'INTERNE';
}
