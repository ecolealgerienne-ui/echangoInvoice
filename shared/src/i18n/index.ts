import i18n, { type i18n as I18nInstance } from 'i18next';
import type { ThirdPartyModule } from 'i18next';
import fr from './fr.json';
import ar from './ar.json';

export { fr, ar };

export type Langue = 'fr' | 'ar';

/** Sens d'écriture par langue — l'arabe est la seule de droite à gauche ici. */
export const SENS: Record<Langue, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

export const LANGUES: { code: Langue; nom: string }[] = [
  { code: 'fr', nom: 'Français' },
  { code: 'ar', nom: 'العربية' },
];

const CLE_STOCKAGE = 'langue';

/** Langue retenue, avec repli sur le français. Lecture défensive : un
 *  `localStorage` inaccessible (mode privé strict) ne doit pas casser le
 *  démarrage de l'application. */
export function langueInitiale(): Langue {
  try {
    const v = globalThis.localStorage?.getItem(CLE_STOCKAGE);
    if (v === 'ar' || v === 'fr') return v;
  } catch { /* stockage indisponible */ }
  return 'fr';
}

export function memoriserLangue(langue: Langue): void {
  try {
    globalThis.localStorage?.setItem(CLE_STOCKAGE, langue);
  } catch { /* stockage indisponible */ }
}

/**
 * Initialise i18next avec les traductions partagées.
 *
 * Le module React est injecté par l'appelant : `shared` ne dépend pas de React,
 * ce qui lui permet d'être consommé hors contexte React (tests, scripts).
 *
 * **Le repli est le français, et c'est assumé.** La traduction arabe couvre la
 * surface réellement parcourue — navigation, tableau de bord, documents,
 * paramètres — mais pas les 865 clés du produit. Une clé non traduite s'affiche
 * en français plutôt qu'en identifiant brut : dégradé lisible plutôt que cassé.
 */
export function createI18n(reactModule?: ThirdPartyModule): I18nInstance {
  const instance = reactModule ? i18n.use(reactModule) : i18n;

  instance.init({
    resources: {
      fr: { translation: fr },
      ar: { translation: ar },
    },
    lng: langueInitiale(),
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });

  return i18n;
}
