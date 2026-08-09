import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ecartPourcent } from '@/lib/montants';

/**
 * Carte d'indicateur.
 *
 * Les quatre cartes du haut du tableau de bord, et toutes leurs cousines des
 * rapports, de la production et de la console d'administration. Elles étaient
 * écrites trois fois, avec trois hauteurs et trois façons d'afficher un écart ;
 * elles sont désormais un seul composant, et c'est lui qui porte la
 * spécification.
 *
 * ── Ce que la spécification impose, et pourquoi c'est juste ──────────────
 *
 * **L'écart est un texte coloré, pas une pastille.** `↑ 14,1 %` en vert
 * discret, suivi de « vs période précédente » en gris. La pastille pleine
 * qu'on avait — fond vert, texte vert foncé, un peu de rembourrage — pesait
 * autant que le montant lui-même, et sur une rangée de quatre cartes, quatre
 * pastilles vertes se lisaient avant les quatre chiffres. Or l'écart est une
 * annotation du chiffre, pas une deuxième information.
 *
 * **La pastille d'icône est un aplat ténu de 38 px, pas un dégradé cerclé.**
 * Le dégradé et son anneau intérieur avaient été ajoutés parce qu'un aplat
 * ténu se dissolvait sur une carte presque blanche ; avec les fonds du nouveau
 * système — la carte est franchement plus claire que la page, et les `-subtle`
 * sont remontés en chroma — l'aplat tient tout seul.
 *
 * **Le montant garde l'encre du texte.** Jamais la couleur du ton. Un montant
 * coloré se lit comme un état (« c'est vert, donc c'est bon »), et un chiffre
 * d'affaires n'est ni bon ni mauvais tant qu'on ne l'a pas comparé.
 *
 * ── La hauteur minimale ──────────────────────────────────────────────────
 *
 * 126 px. Ce n'est pas une coquetterie : les quatre cartes ne portent pas
 * toutes un écart ni un sous-titre, et sans plancher, la rangée se déchirait —
 * la carte de marge, qui n'a pas de comparaison, remontait de vingt pixels et
 * cassait la ligne de base des trois autres.
 */

/**
 * Ton d'une carte. Ce n'est ni un rôle sémantique — un chiffre d'affaires
 * n'est pas « un succès » — ni une série de graphique, dont l'ordre est figé
 * par la sécurité daltonienne. C'est un créneau d'identité : le même
 * indicateur garde son ton d'un mois à l'autre.
 */
export type TonIndicateur = 'primaire' | 'succes' | 'violet' | 'sarcelle' | 'ambre';

const TONS: Record<TonIndicateur, { fond: string; encre: string }> = {
  primaire: { fond: 'bg-primary-subtle', encre: 'text-serie-1' },
  succes: { fond: 'bg-success-subtle', encre: 'text-success' },
  violet: { fond: 'bg-violet-subtle', encre: 'text-violet' },
  sarcelle: { fond: 'bg-info-subtle', encre: 'text-info' },
  ambre: { fond: 'bg-warning-subtle', encre: 'text-warning' },
};

interface ProprietesIndicateur {
  /** Intitulé, rendu en label : 10 px, majuscules, gris. */
  titre: string;
  /** Valeur déjà formatée. La carte ne calcule ni n'abrège rien. */
  valeur: ReactNode;
  /** Montant exact, porté par l'infobulle quand la valeur est abrégée. */
  titreValeur?: string;
  /** Ligne de contexte sous l'écart : part du CA, nombre de factures… */
  sub?: string;
  /**
   * Pastille d'icône. Facultative : les bandeaux de chiffres des fiches — CA
   * facturé, encaissé, encours, dont échu — n'ont pas d'icône qui les
   * distingue, et quatre pastilles identiques ne diraient rien. Sans icône, la
   * carte est la même en tout point, moins la pastille.
   */
  icon?: React.ElementType;
  ton?: TonIndicateur;
  /**
   * La valeur passe en rouge. Réservé à ce qui appelle une action — un encours
   * échu, une dette en retard — et jamais à une mesure neutre : un chiffre
   * d'affaires coloré se lirait comme un jugement.
   */
  alerte?: boolean;
  /**
   * Écart avec la période précédente, en pourcentage. `null` quand la
   * référence est nulle : le serveur ne rend alors aucun pourcentage, parce
   * qu'aucun n'aurait de sens — et un « 0 % » se lirait comme une stagnation
   * alors qu'on part de rien. `undefined` retire la ligne entièrement.
   */
  evolution?: number | null;
  /** Sur les dépenses et les achats, une hausse n'est pas une bonne nouvelle. */
  evolutionInverse?: boolean;
  /** Mention posée dans le coin haut : fraîcheur de la donnée, rafraîchissement. */
  coin?: ReactNode;
  /** Trace de fond, posée en pied de carte. */
  fond?: ReactNode;
  className?: string;
}

export function KpiCard({
  titre, valeur, titreValeur, sub, icon: Icone, ton = 'primaire', alerte,
  evolution, evolutionInverse, coin, fond, className,
}: ProprietesIndicateur) {
  const teinte = TONS[ton];

  return (
    <div
      className={cn(
        'relative min-h-[126px] overflow-hidden rounded-lg border border-border bg-card p-[18px]',
        'transition-colors duration-150 ease-ci hover:border-border-strong',
        className,
      )}
    >
      {/* La trace est posée en fond et non empilée sous le contenu : sinon
          seule la carte qui en porte une serait plus haute, et la rangée de
          quatre perdrait sa ligne de base. */}
      {fond}

      {/* La mention de fraîcheur est hors du flux, dans le coin haut : dans la
          colonne de droite, elle poussait la pastille vers le bas et volait sa
          largeur au montant, qui passait alors sur deux lignes — la seule
          carte des quatre à le faire. */}
      {coin && <div className="absolute end-3 top-2.5 z-10 flex items-center">{coin}</div>}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-3xs font-medium uppercase text-tertiaire">{titre}</p>
          <p
            className={cn(
              'mt-2 font-titre tabular-nums text-2xl',
              alerte ? 'text-destructive-text' : 'text-foreground',
              titreValeur && 'cursor-help',
            )}
            title={titreValeur}
          >
            {valeur}
          </p>

          {evolution !== undefined && (
            <Evolution valeur={evolution} inverse={evolutionInverse} />
          )}
          {sub && <p className="mt-1.5 truncate text-2xs text-muted-foreground">{sub}</p>}
        </div>

        {Icone && (
          <span
            aria-hidden
            className={cn(
              'flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]',
              teinte.fond,
            )}
          >
            <Icone className={cn('h-[18px] w-[18px]', teinte.encre)} />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Écart par rapport à la période précédente.
 *
 * Une flèche, un pourcentage, et le rappel de ce à quoi on compare. La flèche
 * double le signal porté par la couleur, pour les huit pour cent d'hommes qui
 * distinguent mal le rouge du vert — sans elle, la seule différence entre une
 * bonne et une mauvaise nouvelle leur serait invisible.
 *
 * Les flèches sont des glyphes et non des icônes Lucide : à 11 px, un SVG à
 * trait de 1,8 px ne rend qu'une tache, là où « ↑ » est dessiné pour cette
 * taille par la fonte elle-même.
 */
function Evolution({ valeur, inverse }: { valeur: number | null; inverse?: boolean }) {
  const { t } = useTranslation();
  if (valeur === null || valeur === undefined) {
    return <p className="mt-2 text-2xs text-tertiaire">{t('dashboard.pasDeComparaison')}</p>;
  }
  const favorable = inverse ? valeur <= 0 : valeur >= 0;
  const fleche = valeur > 0 ? '↑' : valeur < 0 ? '↓' : '→';

  return (
    <p className="mt-2 flex items-center gap-1.5 text-2xs">
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          favorable ? 'text-success-text' : 'text-destructive-text',
        )}
      >
        <span aria-hidden>{fleche}</span> {ecartPourcent(valeur)}
      </span>
      <span className="min-w-0 truncate text-tertiaire">{t('dashboard.vsPeriodePrecedente')}</span>
    </p>
  );
}
