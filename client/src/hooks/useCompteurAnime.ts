import { useEffect, useRef, useState } from 'react';
import { useMouvementReduit } from './useMouvementReduit';

/**
 * Un montant qui monte jusqu'à sa valeur.
 *
 * Ce n'est pas un ornement. Sur un tableau de bord, les quatre chiffres du
 * haut sont ce qu'on vient lire ; posés d'un coup, ils sont là avant que le
 * regard n'arrive, et on les traverse. Comptés sur huit dixièmes de seconde,
 * ils attirent l'œil au moment exact où ils se stabilisent — et l'ordre des
 * grandeurs se perçoit pendant la montée, avant même d'avoir lu les chiffres.
 *
 * Trois précautions, qui sont ce qui sépare un compteur utile d'un gadget :
 *
 * - **il s'arrête sur la valeur exacte**, jamais sur une approximation de
 *   l'interpolation — le dernier pas est écrit en dur ;
 * - **il repart de la valeur précédente**, pas de zéro, quand le chiffre change
 *   à la suite d'un changement de période : recompter depuis zéro à chaque
 *   filtre donnerait un tableau de bord qui clignote ;
 * - **il ne bouge pas** si le système demande moins de mouvement, ni si l'écart
 *   est trop faible pour se voir.
 *
 * L'accélération est une sortie cubique : rapide au départ, elle se pose sans
 * rebond. Un rebond sur un montant en dinars laisse croire, une fraction de
 * seconde, que le total a dépassé puis reculé.
 */
export function useCompteurAnime(cible: number, duree = 850): number {
  const reduit = useMouvementReduit();
  const [valeur, setValeur] = useState(reduit ? cible : 0);
  const precedente = useRef(reduit ? cible : 0);

  useEffect(() => {
    const depart = precedente.current;
    const arrivee = Number.isFinite(cible) ? cible : 0;

    if (reduit || depart === arrivee || Math.abs(arrivee - depart) < 1) {
      precedente.current = arrivee;
      setValeur(arrivee);
      return undefined;
    }

    let image = 0;
    const debut = performance.now();
    const avancer = (maintenant: number) => {
      const t = Math.min(1, (maintenant - debut) / duree);
      const adouci = 1 - (1 - t) ** 3;
      setValeur(t === 1 ? arrivee : depart + (arrivee - depart) * adouci);
      if (t < 1) image = requestAnimationFrame(avancer);
      else precedente.current = arrivee;
    };
    image = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(image);
  }, [cible, duree, reduit]);

  return valeur;
}
