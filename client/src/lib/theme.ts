/**
 * Thème clair / sombre / système.
 *
 * Trois états et non deux : « système » n'est pas une commodité, c'est le
 * défaut correct. Le système d'exploitation bascule seul au coucher du soleil
 * sur la plupart des machines, et une application qui ignore ce réglage force
 * l'utilisateur à le refaire à la main deux fois par jour.
 *
 * Le choix est écrit dans `localStorage` et non côté serveur : il appartient à
 * l'appareil, pas au compte. Le même comptable veut du sombre sur son portable
 * le soir et du clair sur le poste de l'entrepôt en plein jour.
 */
export type Theme = 'light' | 'dark' | 'system';

export const CLE_THEME = 'echango-theme';

export function themeStocke(): Theme {
  try {
    const v = localStorage.getItem(CLE_THEME);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    // Navigation privée, stockage plein, ou iframe cloisonnée : le thème
    // n'est pas une raison de faire tomber l'application.
    return 'system';
  }
}

export function themeSystemeEstSombre(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Le thème réellement affiché, une fois « système » résolu. */
export function themeEffectif(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (themeSystemeEstSombre() ? 'dark' : 'light') : theme;
}

/**
 * Applique le thème au document.
 *
 * `color-scheme` compte autant que la classe : sans lui, les contrôles rendus
 * par le navigateur — sélecteurs de date, cases à cocher, barres de
 * défilement natives — restent clairs au milieu d'une page sombre. C'est le
 * détail qui trahit un thème posé à moitié.
 */
export function appliquerTheme(theme: Theme): void {
  const effectif = themeEffectif(theme);
  const racine = document.documentElement;
  racine.classList.toggle('dark', effectif === 'dark');
  racine.style.colorScheme = effectif;
}

export function enregistrerTheme(theme: Theme): void {
  try {
    localStorage.setItem(CLE_THEME, theme);
  } catch { /* voir themeStocke : le stockage peut être refusé */ }
}
