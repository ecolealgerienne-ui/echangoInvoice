import i18n, { type i18n as I18nInstance } from 'i18next';
import type { ThirdPartyModule } from 'i18next';
import fr from './fr.json';

export { fr };

/**
 * Initialise i18next avec les traductions partagées.
 *
 * Le module React est injecté par l'appelant : `shared` ne dépend pas de React,
 * ce qui lui permet d'être consommé hors contexte React (tests, scripts).
 */
export function createI18n(reactModule?: ThirdPartyModule): I18nInstance {
  const instance = reactModule ? i18n.use(reactModule) : i18n;

  instance.init({
    resources: { fr: { translation: fr } },
    lng: 'fr',
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });

  return i18n;
}
