import { useEffect, useRef } from 'react';

/**
 * Lecture d'une douchette code-barres USB.
 *
 * Une douchette se déclare comme un clavier : elle « tape » les caractères du
 * code puis un Entrée. Rien ne la distingue d'un utilisateur — sauf la
 * cadence. Un lecteur émet huit à quatorze caractères en moins de cent
 * millisecondes ; une frappe humaine soutenue tourne autour de cinq caractères
 * par seconde.
 *
 * C'est donc l'écart entre deux touches qui sert de signature. Le seuil est
 * volontairement large : trop serré, un scan est manqué et l'utilisateur ne
 * comprend pas pourquoi ; trop lâche, une saisie rapide déclenche un faux scan.
 *
 * Aucune dépendance, aucune permission, aucun navigateur particulier — c'est ce
 * qui rend ce mode prioritaire sur la caméra.
 */

/** Écart maximal entre deux touches d'un même scan. */
const ECART_MAX_MS = 60;
/** En deçà, ce n'est pas un code-barres mais une frappe isolée. */
const LONGUEUR_MIN = 4;

export function useDouchette(
  onScan: (code: string) => void,
  options: { actif?: boolean } = {},
) {
  const { actif = true } = options;
  const tampon = useRef('');
  const dernierTemps = useRef(0);
  // Le callback change à chaque rendu ; le garder dans une ref évite de
  // réabonner l'écouteur — et de perdre un scan en cours pendant l'échange.
  const rappel = useRef(onScan);
  rappel.current = onScan;

  useEffect(() => {
    if (!actif) return;

    function auClavier(e: KeyboardEvent) {
      // Une douchette n'utilise pas de modificateur ; un raccourci clavier, si.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const maintenant = Date.now();
      const ecart = maintenant - dernierTemps.current;
      dernierTemps.current = maintenant;

      if (e.key === 'Enter') {
        const code = tampon.current;
        tampon.current = '';
        if (code.length >= LONGUEUR_MIN) {
          // Empêche la validation du formulaire sous-jacent : le Entrée
          // appartient au scan, pas à l'utilisateur.
          e.preventDefault();
          rappel.current(code);
        }
        return;
      }

      // Un seul caractère imprimable : on ignore Tab, Shift, les flèches…
      if (e.key.length !== 1) return;

      // Trop lent pour un lecteur : on repart de cette touche, qui peut être
      // le premier caractère du scan suivant.
      tampon.current = ecart > ECART_MAX_MS ? e.key : tampon.current + e.key;
    }

    window.addEventListener('keydown', auClavier, true);
    return () => window.removeEventListener('keydown', auClavier, true);
  }, [actif]);
}
