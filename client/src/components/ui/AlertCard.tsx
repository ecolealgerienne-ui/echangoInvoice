import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Carte d'alerte.
 *
 * C'est l'écart le plus visible entre ce qu'affichait l'application et ce que
 * demande la spécification. Le bloc « À traiter » posait ses alertes sur des
 * surfaces nues, séparées par un filet ; la maquette en fait de **petites
 * surfaces colorées** — un aplat `-subtle` cerné de son `-border`, à
 * l'intérieur d'une carte qui, elle, reste neutre.
 *
 * La nuance porte tout le sens : **on ne colore pas la carte, on colore
 * l'alerte.** Une carte entièrement rouge dit « ce bloc est un problème », ce
 * qui est faux — le bloc est une liste de travaux, et c'est chaque ligne qui
 * est urgente ou non. Colorer le contenant aurait aussi mangé les 10 % de
 * sémantique que le dosage laisse à toute la page, d'un seul coup.
 *
 * ── Le nombre est à gauche, gros, dans sa couleur ────────────────────────
 *
 * C'est l'ordre de la maquette, et il est meilleur que celui qu'on avait : on
 * ouvre ce bloc pour savoir *combien*, pas pour lire l'intitulé de la
 * quatrième ligne. Le libellé et le lien suivent, en deux lignes serrées.
 *
 * ── Chaque alerte mène sur la liste exactement filtrée ────────────────────
 *
 * « Factures impayées — 276 » suivi d'une liste qui en montre 180 est la pire
 * façon de perdre la confiance d'un écran. Le lien porte donc le filtre qui
 * rendra exactement le nombre annoncé, et c'est au serveur de découper ses
 * compteurs comme le filtre les découpe, pas l'inverse.
 */
export type GraviteAlerte = 'destructive' | 'warning' | 'info' | 'success';

const GRAVITES: Record<GraviteAlerte, { fond: string; bordure: string; encre: string }> = {
  destructive: {
    fond: 'bg-destructive-subtle',
    bordure: 'border-destructive-border hover:border-destructive/70',
    encre: 'text-destructive-text',
  },
  warning: {
    fond: 'bg-warning-subtle',
    bordure: 'border-warning-border hover:border-warning/70',
    encre: 'text-warning-text',
  },
  info: {
    fond: 'bg-info-subtle',
    bordure: 'border-info-border hover:border-info/70',
    encre: 'text-info-text',
  },
  success: {
    fond: 'bg-success-subtle',
    bordure: 'border-success-border hover:border-success/70',
    encre: 'text-success-text',
  },
};

interface ProprietesAlerte {
  /** Ce qu'il y a à faire. Une ligne, treize pixels. */
  libelle: string;
  /** Le compte. C'est la première chose lue. */
  nombre: number | string;
  /** Précision sous le libellé : le montant en jeu, un délai. */
  detail?: string;
  icon: React.ElementType;
  gravite: GraviteAlerte;
  /** Destination du clic. Absente, la carte n'est pas cliquable. */
  vers?: string;
  className?: string;
}

export function AlertCard({
  libelle, nombre, detail, icon: Icone, gravite, vers, className,
}: ProprietesAlerte) {
  const teinte = GRAVITES[gravite];

  const contenu = (
    <>
      <span
        aria-hidden
        className={cn('mt-px flex h-7 w-7 shrink-0 items-center justify-center', teinte.encre)}
      >
        <Icone className="h-[18px] w-[18px]" />
      </span>

      {/* Le nombre est seul sur sa ligne, le libellé dessous.
          La maquette les met côte à côte ; le bloc « À traiter » n'occupe que
          deux colonnes sur douze, et « 381 Factures en retard » sur une seule
          ligne y coupait le libellé au troisième mot. Empilés, ils tiennent
          tous les deux en entier, et l'ordre de lecture reste le bon : combien
          d'abord, de quoi ensuite. */}
      <span className="min-w-0 flex-1">
        <span className={cn('block font-titre tabular-nums text-lg leading-none', teinte.encre)}>
          {nombre}
        </span>
        <span className="mt-1 block text-xs leading-snug text-foreground">{libelle}</span>
        {detail && (
          <span className="mt-0.5 block truncate text-2xs tabular-nums text-muted-foreground">
            {detail}
          </span>
        )}
      </span>

      {vers && (
        /* La chevron se retourne en arabe : elle montre la direction de la
           lecture, pas un côté de l'écran. */
        <ChevronRight
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 self-start text-tertiaire transition-transform duration-150 ease-ci group-hover/alerte:translate-x-0.5 rtl:rotate-180 rtl:group-hover/alerte:-translate-x-0.5"
        />
      )}
    </>
  );

  const classe = cn(
    'group/alerte flex items-start gap-2 rounded-md border px-2.5 py-2.5',
    'transition-[background-color,border-color] duration-150 ease-ci',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    teinte.fond,
    teinte.bordure,
    className,
  );

  if (!vers) return <div className={classe}>{contenu}</div>;
  return <Link to={vers} className={classe}>{contenu}</Link>;
}
