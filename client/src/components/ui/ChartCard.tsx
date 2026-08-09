import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LienCarte } from '@/components/shared/LienCarte';
import { cn } from '@/lib/utils';

/**
 * Carte de bloc — un titre, un contrôle, un contenu, un lien de pied.
 *
 * C'est le contenant de tout ce qui n'est pas un indicateur ni un tableau : les
 * graphiques, les classements, les listes courtes, les répartitions. Elle
 * s'appelait `CarteBloc` et vivait dans le tableau de bord ; les rapports, la
 * production et les fiches en avaient chacun leur variante, avec des titres de
 * trois tailles différentes.
 *
 * ── Le lien de pied ──────────────────────────────────────────────────────
 *
 * Une carte montre cinq lignes sur trois cents. Le pied de carte est l'endroit
 * exact où l'on arrive en se demandant « et le reste ? » — le mettre ailleurs,
 * ou ne pas le mettre, oblige à retrouver l'entrée de navigation qui
 * correspond, ce qui suppose de savoir laquelle c'est.
 *
 * ── Pourquoi le contenu est étiré ────────────────────────────────────────
 *
 * `flex h-full flex-col` avec un contenu en `flex-1` : dans une grille de
 * quatre cartes de hauteurs inégales, le lien de pied doit rester collé en bas
 * de **chaque** carte, sinon il flotte au milieu de la plus haute et l'œil ne
 * sait plus s'il appartient au bloc ou au suivant.
 */
export function ChartCard({
  titre, action, lienVers, lienLibelle, children, className, contenuClassName,
}: {
  titre: string;
  /** Contrôle posé à droite du titre — un sélecteur de fenêtre, par exemple. */
  action?: ReactNode;
  lienVers?: string;
  lienLibelle?: string;
  children: ReactNode;
  className?: string;
  contenuClassName?: string;
}) {
  return (
    <Card vivante className={cn('flex h-full flex-col', className)}>
      {/* Le titre revient à la ligne plutôt que de se couper : « Valeur du
          stock par arti… » n'apprend rien, alors que deux lignes coûtent seize
          pixels — et la carte est de toute façon étirée à la hauteur de sa
          voisine la plus haute. */}
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="min-w-0 leading-snug">{titre}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={cn('flex-1', contenuClassName)}>{children}</CardContent>
      {lienVers && lienLibelle && <LienCarte vers={lienVers} libelle={lienLibelle} />}
    </Card>
  );
}
