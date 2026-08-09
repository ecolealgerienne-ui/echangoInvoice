import { cn } from '@/lib/utils';
import { couleurSerie, creneauSerie } from '@/lib/filieres';

/**
 * Barre de progression.
 *
 * Cinq pixels de haut, rayon plein, piste `--ci-piste`. C'est la seule barre du
 * produit : celles du classement des clients, celles des encaissements par
 * mode, celles de la valeur du stock par article, et les jauges de remplissage
 * des fiches. Elles étaient écrites quatre fois, avec quatre hauteurs — 2, 6, 8
 * et 10 px — et deux façons de peindre la rainure.
 *
 * ── La piste est neutre, la barre est colorée ────────────────────────────
 *
 * La rainure portait auparavant la teinte de la barre à 12 % d'opacité, au nom
 * du principe qu'une gouttière grise sous une barre colorée creuse la ligne.
 * La spécification tranche autrement, et elle a raison ici : quatre pistes de
 * quatre teintes différentes sur un même bloc redoublent la couleur des barres
 * et rendent la comparaison des longueurs plus difficile, puisque le fond
 * change en même temps que la mesure. Une piste unique, et l'œil ne compare
 * plus que ce qui varie.
 *
 * ── Pas de dégradé ───────────────────────────────────────────────────────
 *
 * La barre était un dégradé de sa propre teinte atténuée vers sa teinte
 * pleine. À cinq pixels de haut, un dégradé n'est pas perçu comme un dégradé :
 * il est perçu comme une barre dont le début est plus pâle, c'est-à-dire comme
 * du bruit. Aplat.
 */
export function ProgressBar({
  part, creneau = 0, couleur, className, hauteur = 5, anime = true, delai = 0,
}: {
  /** Part remplie, de 0 à 100. */
  part: number;
  /** Créneau de série (0 à 5). Ignoré si `couleur` est fournie. */
  creneau?: number;
  /** Couleur imposée, pour les cas hors du vocabulaire des séries. */
  couleur?: string;
  className?: string;
  /** Cinq pixels par défaut. Les jauges de remplissage montent à six. */
  hauteur?: number;
  anime?: boolean;
  /** Décalage de l'animation, pour qu'une pile de barres se remplisse en cascade. */
  delai?: number;
}) {
  // Un pour cent et demi de plancher : sans lui, une valeur non nulle mais très
  // petite ne dessine rien du tout, et « 0 » et « presque rien » se ressemblent.
  const largeur = Math.min(100, Math.max(part > 0 ? 1.5 : 0, part));

  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-piste', className)}
      style={{ height: hauteur }}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-ci', anime && 'grandir')}
        style={{
          width: `${largeur}%`,
          animationDelay: `${delai}ms`,
          backgroundColor: couleur ?? couleurSerie(creneauSerie(creneau)),
        }}
      />
    </div>
  );
}
