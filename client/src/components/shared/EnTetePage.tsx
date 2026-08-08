import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatEntier } from '@/lib/montants';

/**
 * En-tête d'une liste.
 *
 * « Clients », et vingt lignes en dessous. La question qui vient juste après —
 * *combien en ai-je ?* — n'avait pas de réponse à l'écran : il fallait
 * descendre jusqu'à la pagination, lire « 1 / 63 », et multiplier par la taille
 * de page. Le total est pourtant déjà là, rendu par le serveur dans chaque
 * réponse paginée ; il ne manquait qu'un endroit où l'écrire.
 *
 * Il se pose **sous** le titre et non à côté : la ligne de titre porte déjà
 * l'action principale à droite, et un troisième objet sur la même ligne aurait
 * fait choisir entre trois choses au lieu de deux.
 *
 * Le total suit la recherche et les filtres — c'est le total de ce qui est
 * listé, pas du fichier entier. C'est le bon comportement : après avoir tapé
 * « Hoggar », « 4 clients au total » répond à la question qu'on vient de poser.
 *
 * Il reste absent tant que la première réponse n'est pas là. Un « 0 client au
 * total » affiché pendant le chargement se lit comme un fichier vide, et c'est
 * la pire chose qu'on puisse montrer à quelqu'un qui ouvre sa liste de clients.
 */
export function EnTetePage({
  titre, total, cleTotal, children,
}: {
  titre: string;
  /** `pagination.total` de la liste. Absent pendant le chargement. */
  total?: number | null;
  /** Clé i18n du libellé, interpolée sur `{{nombre}}`. */
  cleTotal: string;
  /** Action principale, posée à droite du titre. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-foreground">{titre}</h1>
        {total !== null && total !== undefined && (
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {t(cleTotal, { nombre: formatEntier(total) })}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
