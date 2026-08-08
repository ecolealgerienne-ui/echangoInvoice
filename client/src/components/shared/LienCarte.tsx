import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

/**
 * Lien de pied de carte : « Voir tous les clients → ».
 *
 * Une carte de tableau de bord montre les cinq premières lignes de quelque
 * chose. La sixième existe, et rien ne le disait : il fallait deviner que la
 * liste complète se trouvait dans la barre latérale, et retrouver le bon
 * intitulé. Le pied de carte est l'endroit où le regard arrive après avoir lu
 * les cinq lignes — c'est là que la question « et le reste ? » se pose.
 *
 * La flèche se retourne en arabe : elle montre le sens de la lecture, pas un
 * côté d'écran. Elle avance de deux pixels au survol, ce qui fait du couple
 * texte-flèche un seul objet cliquable plutôt qu'un mot souligné.
 *
 * Le trait de séparation est porté par le lien lui-même et non par la carte :
 * une carte sans lien n'a pas à réserver la place d'un pied qu'elle n'a pas.
 */
export function LienCarte({ vers, libelle }: { vers: string; libelle: string }) {
  return (
    <div className="mt-4 border-t border-border px-4 pb-3 pt-3 text-center">
      <Link
        to={vers}
        className="group/lien inline-flex items-center gap-1.5 rounded-md px-1 text-xs font-medium text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {libelle}
        <ArrowRight
          aria-hidden
          className="h-3.5 w-3.5 transition-transform duration-150 ease-ci group-hover/lien:translate-x-0.5 rtl:rotate-180 rtl:group-hover/lien:-translate-x-0.5"
        />
      </Link>
    </div>
  );
}
