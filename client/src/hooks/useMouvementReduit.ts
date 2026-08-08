import { useEffect, useState } from 'react';

/**
 * Le système demande-t-il moins de mouvement ?
 *
 * Le CSS sait déjà répondre seul — `@media (prefers-reduced-motion: reduce)`
 * neutralise toutes les animations de `globals.css`. Mais une animation écrite
 * en JavaScript, elle, continuerait de tourner : un compteur qui grimpe de zéro
 * à vingt millions n'est pas une transition CSS, c'est une boucle. Ce crochet
 * est ce qui permet de la couper.
 *
 * Il écoute le changement : le réglage se modifie sans recharger la page, et un
 * utilisateur qui l'active au milieu d'une session le fait rarement par curiosité.
 */
export function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(() =>
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const requete = window.matchMedia('(prefers-reduced-motion: reduce)');
    const surChangement = (e: MediaQueryListEvent) => setReduit(e.matches);
    requete.addEventListener('change', surChangement);
    return () => requete.removeEventListener('change', surChangement);
  }, []);

  return reduit;
}
