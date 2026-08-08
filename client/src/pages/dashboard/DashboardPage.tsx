import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, TrendingDown, FileText, Package, DollarSign,
  AlertTriangle, Percent, Minus, ChevronRight, Hourglass, Wallet,
  Plus, SlidersHorizontal, RefreshCw, Check,
  Banknote, Landmark, FileCheck, CircleDollarSign,
} from 'lucide-react';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { ecartPourcent, montantAbrege, pourcentage } from '@/lib/montants';
import { SelecteurPeriode, periodeParDefaut, derniersJours } from '@/components/shared/SelecteurPeriode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EtatVide } from '@/components/shared/EtatVide';
import { LienCarte } from '@/components/shared/LienCarte';
import { Deroulant, EntreeDeroulant } from '@/components/shared/Deroulant';
import { SqueletteCarte, SqueletteGraphique, SqueletteIndicateur } from '@/components/ui/Squelette';
import { Anneau, BarresClassement, CourbeAire, Sparkline } from '@/components/ui/Graphique';
import { useCompteurAnime } from '@/hooks/useCompteurAnime';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { teinteFiliere, type Filiere } from '@/lib/filieres';
import { creneauMode, libelleMode } from '@/lib/modesReglement';

/**
 * Tableau de bord.
 *
 * C'était l'écran le plus gris du produit : quatre chiffres dans quatre cadres
 * blancs, trois listes de couples « intitulé — montant », et une courbe bleue.
 * Rien n'y hiérarchisait quoi que ce soit, et surtout rien n'y répondait à la
 * question qu'on se pose en l'ouvrant — *est-ce que ça va ?*
 *
 * Les changements qui y répondent :
 *
 * - **les indicateurs comptent.** Le montant monte jusqu'à sa valeur en huit
 *   dixièmes de seconde. L'ordre de grandeur se perçoit pendant la montée, et
 *   le regard est attiré à l'instant où le chiffre se fige. La pastille
 *   d'icône porte le dégradé de sa filière : quatre cartes identiques ne se
 *   distinguaient que par leur intitulé, lu de haut en bas ;
 *
 * - **les dépenses sont un anneau.** Six lignes de montants obligeaient à
 *   faire la division de tête pour savoir si le loyer pesait un dixième ou un
 *   tiers. L'arc dit la part sans calcul, le total occupe le trou du centre, et
 *   la légende garde le montant exact ;
 *
 * - **les alertes cessent d'être une liste.** Chacune est un bloc teinté de sa
 *   gravité, le nombre y est gros, et le clic mène sur la liste exactement
 *   filtrée ;
 *
 * - **chaque carte dit où continuer.** Une carte montre cinq lignes sur
 *   trois cents ; le pied de carte est l'endroit où l'on arrive en se demandant
 *   « et le reste ? ».
 *
 * ── L'ordre des blocs ────────────────────────────────────────────────────
 *
 * La première rangée après les indicateurs rassemble les quatre **états** :
 * où part l'argent, qui le rapporte, ce qui reste à faire, ce qui dort en
 * stock. La seconde rassemble les trois **séries** : le chiffre d'affaires
 * jour par jour, les encaissements par mode, les lots qui approchent de leur
 * date. On lit d'abord une situation, ensuite un mouvement — l'inverse
 * obligeait à interpréter une courbe avant de savoir de quoi elle parlait.
 *
 * Sur le chargement, des squelettes remplacent le disque qui tourne : la mise
 * en page ne bouge plus quand les données arrivent.
 */

/**
 * Blocs que « Personnaliser » sait masquer.
 *
 * Les quatre indicateurs du haut n'y sont pas : ils tiennent sur une rangée,
 * ils sont la raison d'ouvrir l'écran, et un tableau de bord dont on peut
 * retirer le chiffre d'affaires n'est plus un tableau de bord.
 *
 * Le réglage passe par `useColumnVisibility`, le hook des colonnes de tableau :
 * c'est exactement la même mécanique — une liste de clés visibles, une bascule,
 * un enregistrement local — et une seconde copie aurait divergé au premier
 * ajustement.
 */
const BLOCS = [
  'depenses', 'topClients', 'aTraiter', 'stockArticle',
  'chiffreAffaires', 'encaissements', 'lots',
] as const;
type Bloc = (typeof BLOCS)[number];

/** Icône de chaque mode de règlement, dans l'ordre de référence des modes. */
const ICONES_MODE: Record<string, React.ElementType> = {
  cash: Banknote,
  bank_transfer: Landmark,
  cheque: FileCheck,
  other: CircleDollarSign,
};

/** Fenêtres proposées sous le graphique de chiffre d'affaires. */
const FENETRES_COURBE = [7, 14, 30, 90] as const;

/**
 * Écart par rapport à la période précédente.
 *
 * `null` quand la référence est nulle : le serveur ne rend alors aucun
 * pourcentage, parce qu'aucun n'aurait de sens — et un « 0 % » se lirait comme
 * une stagnation alors qu'on part de rien.
 *
 * L'écart est une pastille au lieu d'une ligne de texte colorée : sur fond
 * ténu, la couleur porte plus loin, et la flèche double le signal pour qui
 * distingue mal le rouge du vert.
 */
function Evolution({ valeur, inverse }: { valeur: number | null; inverse?: boolean }) {
  const { t } = useTranslation();
  if (valeur === null || valeur === undefined) {
    return <p className="mt-1.5 text-2xs text-muted-foreground">{t('dashboard.pasDeComparaison')}</p>;
  }
  // Sur les dépenses et les achats, une hausse n'est pas une bonne nouvelle.
  const favorable = inverse ? valeur <= 0 : valeur >= 0;
  const Fleche = valeur > 0 ? TrendingUp : valeur < 0 ? TrendingDown : Minus;

  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-semibold',
          favorable ? 'bg-success-subtle text-success-text' : 'bg-destructive-subtle text-destructive-text',
        )}
      >
        <Fleche className="h-3 w-3" aria-hidden />
        {ecartPourcent(valeur)}
      </span>
      <span className="min-w-0 truncate text-2xs text-muted-foreground">
        {t('dashboard.vsPeriodePrecedente')}
      </span>
    </div>
  );
}

/**
 * Carte d'indicateur.
 *
 * La pastille d'icône est un dégradé de la filière, bordée d'un anneau de la
 * même teinte : sur une carte presque blanche, un aplat ténu seul se dissout.
 * Le chiffre, lui, garde l'encre du texte — jamais la couleur de la filière.
 * Un montant coloré se lit comme un état (« c'est vert, donc c'est bon »), et
 * un chiffre d'affaires n'est ni bon ni mauvais tant qu'on ne l'a pas comparé.
 *
 * ── Le montant est abrégé ────────────────────────────────────────────────
 *
 * `20,4 M DA`, et non `20 409 086,29 DA`. Écrit en entier, il tenait sur deux
 * lignes, poussait la carte plus haut que ses trois voisines et cassait la
 * ligne de base de la rangée ; surtout, il se lisait chiffre par chiffre alors
 * qu'on ne vient y chercher qu'un ordre de grandeur. Le montant exact reste à
 * un survol, dans l'infobulle du navigateur — c'est le geste attendu quand on
 * veut le détail, et il ne coûte rien à ceux qui ne le veulent pas.
 *
 * L'infobulle porte la **valeur d'arrivée**, jamais le compteur en cours
 * d'animation : survoler une carte pendant sa montée doit donner le montant,
 * pas une étape.
 */
function CarteIndicateur({
  titre, valeur, sub, icon: Icone, filiere, evolution, evolutionInverse, tendance, coin,
}: {
  titre: string;
  valeur: number;
  sub?: string;
  icon: React.ElementType;
  filiere: Filiere;
  evolution?: number | null;
  evolutionInverse?: boolean;
  /** Série pour l'étincelle du bas. Omise, la carte n'en porte pas. */
  tendance?: number[];
  /** Mention posée au-dessus de la pastille : fraîcheur de la donnée, rafraîchissement. */
  coin?: React.ReactNode;
}) {
  const anime = useCompteurAnime(valeur);
  const teinte = teinteFiliere(filiere);
  const couleurFiliere = `oklch(var(--ci-filiere-${filiere}))`;

  return (
    <Card vivante voile className="overflow-hidden">
      {/* L'étincelle est posée en fond, pas empilée sous le contenu : sinon
          seule la carte qui en porte une serait plus haute, et la rangée de
          quatre perdrait sa ligne de base. */}
      {tendance && tendance.length > 1 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-45">
          <Sparkline className="h-full" valeurs={tendance} couleur={couleurFiliere} />
        </div>
      )}
      <CardContent className={cn('relative p-5', coin && 'pt-7')}>
        {/* La mention de fraîcheur est posée **hors du flux**, dans le coin
            haut : dans la colonne de droite, elle poussait la pastille d'icône
            vers le bas et surtout volait sa largeur au montant, qui passait
            alors sur deux lignes — la seule carte des quatre à le faire, et
            toute la rangée perdait sa ligne de base. */}
        {coin && <div className="absolute end-3 top-2 flex items-center">{coin}</div>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {titre}
            </p>
            <p
              className="mt-1.5 cursor-help text-2xl font-bold tabular-nums text-foreground"
              title={formatCurrency(valeur)}
            >
              {montantAbrege(anime)}
            </p>
            {evolution !== undefined && <Evolution valeur={evolution} inverse={evolutionInverse} />}
            {sub && <p className="mt-1 truncate text-2xs text-muted-foreground">{sub}</p>}
          </div>
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset',
              teinte.degrade,
              teinte.anneau,
            )}
          >
            <Icone className={cn('h-5 w-5', teinte.texte)} aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Une ligne de « À traiter » : un travail, et le lien qui l'ouvre.
 *
 * Le bloc s'appelait « Alertes » et affichait trois compteurs muets. On y
 * lisait « Factures impayées — 276 », et il fallait ensuite aller aux factures,
 * dérouler le filtre de statut, choisir le bon, et espérer retomber sur le même
 * nombre. Le tableau de bord disait *voici l'état* ; il dit désormais *voici
 * quoi faire*, et chaque ligne emmène sur la liste exactement filtrée.
 *
 * « Exactement » est la contrainte qui a fait bouger le serveur : le filtre des
 * factures ne prend qu'un statut à la fois, alors que le compteur additionnait
 * les envoyées et les partielles. Le clic aurait mené sur une liste plus courte
 * que le nombre annoncé — la pire façon de perdre la confiance d'un écran. Les
 * compteurs sont donc découpés comme le filtre les découpe.
 *
 * Le montant en jeu accompagne le nombre quand il existe : neuf factures en
 * retard n'appellent pas la même journée selon qu'elles pèsent trente mille ou
 * trois millions.
 *
 * Les lignes à zéro ne sont pas affichées. C'est un renversement assumé par
 * rapport au bloc d'alertes, qui les gardait en gris — savoir qu'il n'y a rien
 * était alors l'information. Une liste de travaux, elle, ne liste pas les
 * travaux qu'on n'a pas à faire ; quand il n'en reste aucun, le bloc le dit
 * d'une phrase.
 */
function LigneATraiter({
  libelle, nombre, montant, vers, icon: Icone, gravite,
}: {
  libelle: string;
  nombre: number;
  /** Montant en jeu, s'il y en a un. */
  montant?: number;
  vers: string;
  icon: React.ElementType;
  gravite: 'warning' | 'destructive';
}) {
  return (
    <Link
      to={vers}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5',
        'transition-[background-color,border-color,transform] duration-150 ease-ci',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        gravite === 'warning'
          ? 'border-warning/35 bg-warning-subtle hover:border-warning/60'
          : 'border-destructive/35 bg-destructive-subtle hover:border-destructive/60',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icone
          className={cn('h-4 w-4 shrink-0', gravite === 'warning' ? 'text-warning' : 'text-destructive')}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block text-sm leading-snug text-foreground">{libelle}</span>
          {montant !== undefined && montant > 0 && (
            <span className="block truncate text-2xs tabular-nums text-muted-foreground">
              {montantAbrege(montant)}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span
          className={cn(
            'text-lg font-bold tabular-nums',
            gravite === 'warning' ? 'text-warning-text' : 'text-destructive-text',
          )}
        >
          {nombre}
        </span>
        {/* La chevron se retourne en arabe : elle montre la direction de la
            lecture, pas un côté de l'écran. */}
        <ChevronRight
          aria-hidden
          className="h-4 w-4 text-muted-foreground transition-transform duration-150 ease-ci group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        />
      </span>
    </Link>
  );
}

/** Carte qui porte un lien de pied : le contenu pousse, le lien reste en bas. */
function CarteBloc({
  titre, action, lienVers, lienLibelle, children,
}: {
  titre: string;
  /** Contrôle posé à droite du titre — un sélecteur de fenêtre, par exemple. */
  action?: React.ReactNode;
  lienVers?: string;
  lienLibelle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card vivante className="flex h-full flex-col">
      {/* Le titre revient à la ligne plutôt que de se couper : « Valeur du
          stock par arti… » n'apprend rien, alors que deux lignes coûtent seize
          pixels — et la carte est de toute façon étirée à la hauteur de sa
          voisine la plus haute. */}
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="min-w-0 leading-snug">{titre}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
      {lienVers && lienLibelle && <LienCarte vers={lienVers} libelle={lienLibelle} />}
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [periode, setPeriode] = useState(periodeParDefaut());
  const [joursCourbe, setJoursCourbe] = useState<number>(7);
  const { toggle: basculerBloc, col: blocVisible } = useColumnVisibility<Bloc>(
    'dashboard_blocs', [...BLOCS],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', periode],
    queryFn: () => dashboardApi.stats(periode),
  });

  const { data: salesChartData } = useQuery({
    queryKey: ['dashboard-sales-chart', periode],
    queryFn: () => dashboardApi.salesChart(periode),
  });

  // Le graphique de chiffre d'affaires a sa propre fenêtre : on suit les sept
  // derniers jours pendant que les indicateurs du haut parlent du mois. C'est
  // une deuxième requête, et non un découpage de la première : la période de
  // l'en-tête peut être plus courte que la fenêtre demandée.
  const periodeCourbe = useMemo(() => derniersJours(joursCourbe), [joursCourbe]);
  const { data: courbeData } = useQuery({
    queryKey: ['dashboard-sales-chart', periodeCourbe],
    queryFn: () => dashboardApi.salesChart(periodeCourbe),
  });

  // Pas de période en paramètre : le stock est une photo à l'instant t.
  const {
    data: stockChartData, dataUpdatedAt: stockMaj, refetch: rafraichirStock, isFetching: stockEnCours,
  } = useQuery({
    queryKey: ['dashboard-stock-chart'],
    queryFn: () => dashboardApi.stockChart(),
  });

  const salesChart = salesChartData?.data;
  const stockChart = stockChartData?.data;
  const byDate: any[] = courbeData?.data?.byDate ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <SelecteurPeriode valeur={periode} onChange={setPeriode} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <SqueletteIndicateur key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <SqueletteCarte key={i} lignes={5} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => <SqueletteGraphique key={i} />)}
        </div>
      </div>
    );
  }

  const stats = data?.data;
  if (!stats) return null;

  const { sales, purchases: _purchases, expenses, profit, stock, alerts } = stats;

  const byMethod: [string, number][] = Object.entries(salesChart?.byPaymentMethod ?? {});
  const maxMethod = byMethod.reduce((m, [, v]) => Math.max(m, v as number), 0);
  // La part se calcule sur les encaissements de la période, pas sur le chiffre
  // d'affaires : une facture émise en juin et réglée en juillet fausserait les
  // deux bouts du rapport.
  const totalEncaisse = byMethod.reduce((s, [, v]) => s + Number(v), 0);
  const topStock: any[] = (stockChart?.byRawMaterial ?? []).slice(0, 6);
  const expiring: any[] = stockChart?.expiringWithin30Days ?? [];
  // Une catégorie à zéro n'a pas d'arc à montrer : elle allongeait la légende
  // sans rien y mettre.
  const categories = (Object.entries(expenses.byCategory) as [string, number][])
    .filter(([, montant]) => Number(montant) > 0);
  const tendanceCa = (salesChart?.byDate ?? []).map((d: any) => Number(d.revenue));

  // Le travail en attente, dans l'ordre où il presse. Chaque entrée porte le
  // filtre qui rendra exactement le nombre annoncé.
  const aTraiter = [
    {
      cle: 'overdue',
      libelle: t('dashboard.overdueInvoices'),
      nombre: Number(alerts.overdueInvoicesCount ?? 0),
      montant: Number(alerts.overdueInvoicesTotal ?? 0),
      vers: '/invoices?status=overdue',
      icon: AlertTriangle,
      gravite: 'destructive' as const,
    },
    {
      cle: 'sent',
      libelle: t('dashboard.sentInvoices'),
      nombre: Number(alerts.sentInvoicesCount ?? 0),
      montant: Number(alerts.sentInvoicesTotal ?? 0),
      vers: '/invoices?status=sent',
      icon: FileText,
      gravite: 'warning' as const,
    },
    {
      cle: 'partial',
      libelle: t('dashboard.partialInvoices'),
      nombre: Number(alerts.partialInvoicesCount ?? 0),
      montant: Number(alerts.partialInvoicesTotal ?? 0),
      vers: '/invoices?status=partial',
      icon: Wallet,
      gravite: 'warning' as const,
    },
    {
      cle: 'expiring',
      libelle: t('dashboard.expiringSoon'),
      nombre: Number(alerts.expiringStockCount ?? 0),
      vers: '/stock?tab=alerts',
      icon: Hourglass,
      gravite: 'warning' as const,
    },
    {
      cle: 'lowStock',
      libelle: t('dashboard.lowStock'),
      nombre: Number(alerts.lowStockCount ?? 0),
      vers: '/stock?tab=alerts',
      icon: TrendingDown,
      gravite: 'warning' as const,
    },
  ].filter((l) => l.nombre > 0);

  // Le prénom seul : « Bonjour Amar Amar » se lit comme un formulaire. Un compte
  // sans nom n'a rien à saluer — l'en-tête retombe alors sur le titre de
  // l'écran, plutôt que sur un « Bonjour  » à trou.
  const prenom = user?.name?.trim().split(/\s+/)[0] ?? '';
  const heureMaj = stockMaj
    ? new Intl.DateTimeFormat('fr-DZ', {
      // `hourCycle` explicite : selon la bibliothèque ICU du navigateur,
      // `fr-DZ` rendait « 12:46 AM » — une heure anglo-saxonne au milieu
      // d'une interface française.
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(stockMaj)
    : null;

  return (
    <div className="space-y-6">
      {/* ── En-tête ─────────────────────────────────────────────────────────
          La salutation remplace le titre « Tableau de bord » : sur l'écran
          d'accueil, répéter le nom de l'écran n'apprend rien à celui qui vient
          d'y arriver. La phrase de contexte, elle, dit ce qu'on y regarde. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">
            {prenom ? t('dashboard.salutation', { prenom }) : t('dashboard.title')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('dashboard.salutationContexte')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SelecteurPeriode valeur={periode} onChange={setPeriode} />

          {/* « Personnaliser » masque et rétablit les blocs, et le choix est
              gardé sur le poste. Ce n'est pas un bouton d'apparat : un écran
              d'accueil dont le tiers ne sert pas à tout le monde — la
              production, par exemple, n'est pas activée partout — se range. */}
          <Deroulant
            largeur="w-56"
            declencheur={({ ouvert, basculer }) => (
              <Button variant="outline" size="sm" onClick={basculer} aria-expanded={ouvert} aria-haspopup="menu">
                <SlidersHorizontal className="h-4 w-4" />
                {t('dashboard.personnaliser')}
              </Button>
            )}
          >
            <p className="px-2.5 pb-1.5 pt-1 text-2xs text-muted-foreground">
              {t('dashboard.personnaliserAide')}
            </p>
            {BLOCS.map((bloc) => (
              <button
                key={bloc}
                type="button"
                onClick={() => basculerBloc(bloc)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-sm text-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    blocVisible(bloc) ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {blocVisible(bloc) && <Check className="h-3 w-3" aria-hidden />}
                </span>
                <span className="min-w-0 truncate">{t(`dashboard.blocs.${bloc}`)}</span>
              </button>
            ))}
          </Deroulant>

          {/* « + Nouveau » n'invente rien : chaque entrée ouvre le formulaire de
              création de son écran, par le paramètre `?nouveau=1` que ces
              écrans savent lire. */}
          <Deroulant
            largeur="w-52"
            declencheur={({ ouvert, basculer }) => (
              <Button size="sm" onClick={basculer} aria-expanded={ouvert} aria-haspopup="menu">
                <Plus className="h-4 w-4" />
                {t('dashboard.nouveau')}
              </Button>
            )}
          >
            <EntreeDeroulant icone={FileText} to="/invoices?nouveau=1">{t('invoices.new')}</EntreeDeroulant>
            <EntreeDeroulant icone={FileText} to="/quotes?nouveau=1">{t('quotes.new')}</EntreeDeroulant>
            <EntreeDeroulant icone={DollarSign} to="/customers?nouveau=1">{t('customers.new')}</EntreeDeroulant>
          </Deroulant>
        </div>
      </div>

      {/* ── Indicateurs ─────────────────────────────────────────────────── */}
      <div className="echelonner grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CarteIndicateur
          titre={t('dashboard.revenue')}
          valeur={Number(sales.totalRevenue)}
          evolution={stats.evolution?.revenue}
          sub={`${sales.invoiceCount} ${t('dashboard.invoiceCount').toLowerCase()}`}
          icon={DollarSign}
          filiere="ventes"
          tendance={tendanceCa}
        />
        <CarteIndicateur
          titre={t('dashboard.grossMargin')}
          valeur={Number(profit.grossMargin)}
          sub={t('dashboard.partDuCa', {
            part: pourcentage(Number(profit.grossMargin), Number(sales.totalRevenue)),
          })}
          icon={Percent}
          filiere="finance"
        />
        <CarteIndicateur
          titre={t('dashboard.netProfit')}
          valeur={Number(profit.netProfit)}
          evolution={stats.evolution?.netProfit}
          sub={t('dashboard.partDuCa', {
            part: pourcentage(Number(profit.netProfit), Number(sales.totalRevenue)),
          })}
          icon={TrendingUp}
          filiere="achats"
        />
        {/* La valeur du stock est la seule des quatre à ne pas dépendre de la
            période : c'est une photo prise à l'instant du chargement. Elle est
            donc la seule à devoir dire **quand** elle a été prise, et à offrir
            d'en reprendre une — les entrées de stock bougent toute la journée,
            et rien d'autre à l'écran ne le signalerait. */}
        <CarteIndicateur
          titre={t('dashboard.stockValue')}
          valeur={Number(stock.totalStockValue)}
          icon={Package}
          filiere="catalogue"
          coin={heureMaj && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="hidden truncate xl:inline">
                {t('dashboard.derniereMaj', { heure: heureMaj })}
              </span>
              <button
                type="button"
                onClick={() => rafraichirStock()}
                disabled={stockEnCours}
                aria-label={t('dashboard.rafraichir')}
                title={t('dashboard.rafraichir')}
                className="rounded p-0.5 transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3 w-3', stockEnCours && 'animate-spin')} aria-hidden />
              </button>
            </span>
          )}
        />
      </div>

      {/* ── Les quatre états ────────────────────────────────────────────── */}
      <div className="echelonner grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        {blocVisible('depenses') && (
          <div className="lg:col-span-4">
            <CarteBloc
              titre={t('dashboard.expenses')}
              lienVers="/expenses"
              lienLibelle={t('dashboard.voirDepenses')}
            >
              {categories.length === 0 ? (
                <EtatVide compact texte={t('common.videTexte')} />
              ) : (
                /* Les catégories de dépense sont des entités fixes : chacune
                   garde son créneau de couleur d'un mois à l'autre, comme les
                   modes de règlement. Le créneau vient de la position dans la
                   liste rendue par le serveur, qui est elle-même figée. */
                <Anneau
                  libelleTotal={t('common.total')}
                  parts={categories.map(([cat, montant], i) => ({
                    libelle: t(`expenses.categories.${cat}`),
                    valeur: Number(montant),
                    creneau: i,
                  }))}
                  format={(v) => montantAbrege(v)}
                />
              )}
            </CarteBloc>
          </div>
        )}

        {/* Top clients : un classement — teinte unique, rangs numérotés, et
            l'écart avec la période précédente quand le serveur sait le
            calculer. */}
        {blocVisible('topClients') && (
          <div className="lg:col-span-3">
            <CarteBloc
              titre={t('dashboard.topCustomers')}
              lienVers="/customers"
              lienLibelle={t('dashboard.voirClients')}
            >
              {sales.topCustomers.length === 0 ? (
                <EtatVide compact texte={t('common.videTexte')} />
              ) : (
                <BarresClassement
                  serie={0}
                  rangs
                  lignes={sales.topCustomers.map((c: any) => ({
                    libelle: c.name,
                    valeur: Number(c.total),
                    variation: c.evolution ?? null,
                  }))}
                  format={(v) => montantAbrege(v)}
                />
              )}
            </CarteBloc>
          </div>
        )}

        {blocVisible('aTraiter') && (
          <div className="lg:col-span-3">
            <CarteBloc
              titre={t('dashboard.toDo')}
              lienVers="/stock?tab=alerts"
              lienLibelle={t('dashboard.voirAlertes')}
            >
              <div className="space-y-2">
                {aTraiter.length === 0 ? (
                  <EtatVide compact texte={t('dashboard.nothingToDo')} />
                ) : aTraiter.map((l) => (
                  <LigneATraiter
                    key={l.cle}
                    libelle={l.libelle}
                    nombre={l.nombre}
                    montant={l.montant}
                    vers={l.vers}
                    icon={l.icon}
                    gravite={l.gravite}
                  />
                ))}
              </div>
            </CarteBloc>
          </div>
        )}

        {blocVisible('stockArticle') && (
          <div className="lg:col-span-2">
            <CarteBloc
              titre={t('dashboard.stockByProduct')}
              lienVers="/products"
              lienLibelle={t('dashboard.voirArticles')}
            >
              {topStock.length === 0
                ? <EtatVide compact texte={t('common.videTexte')} />
                : (
                  <BarresClassement
                    serie={3}
                    lignes={topStock.map((r: any) => ({
                      libelle: r.name,
                      valeur: Number(r.stockValue),
                    }))}
                    format={(v) => montantAbrege(v)}
                  />
                )}
            </CarteBloc>
          </div>
        )}
      </div>

      {/* ── Les trois séries ────────────────────────────────────────────── */}
      <div className="echelonner grid grid-cols-1 gap-4 lg:grid-cols-12">
        {blocVisible('chiffreAffaires') && (
          <div className="lg:col-span-5">
            <CarteBloc
              titre={t('dashboard.revenueByDay')}
              action={(
                <select
                  value={joursCourbe}
                  onChange={(e) => setJoursCourbe(Number(e.target.value))}
                  aria-label={t('dashboard.fenetreCourbe')}
                  className="h-7 shrink-0 rounded-md border border-border bg-surface px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {FENETRES_COURBE.map((n) => (
                    <option key={n} value={n}>{t('dashboard.derniersJours', { count: n })}</option>
                  ))}
                </select>
              )}
            >
              {byDate.length === 0
                ? <EtatVide compact texte={t('common.videTexte')} />
                : (
                  <CourbeAire
                    serie={0}
                    compare
                    formatComparaison={(d) => t('dashboard.vsDate', { date: d })}
                    points={byDate.map((d: any) => ({
                      libelle: formatDate(d.date),
                      valeur: Number(d.revenue),
                    }))}
                    format={(v) => montantAbrege(v, 2)}
                  />
                )}
            </CarteBloc>
          </div>
        )}

        {/* Modes de règlement : quatre entités fixes, donc quatre créneaux de
            couleur fixes — le créneau vient de la position du mode dans sa
            liste de référence, jamais de son rang du mois. La pastille est un
            carré arrondi portant l'icône du moyen : sur quatre lignes, un point
            de couleur seul obligeait à faire l'aller-retour avec la légende. */}
        {blocVisible('encaissements') && (
          <div className="lg:col-span-4">
            <CarteBloc titre={t('dashboard.byPaymentMethod')}>
              {maxMethod === 0
                ? <EtatVide compact texte={t('common.videTexte')} />
                : (
                  <BarresClassement
                    teintes={byMethod.map(([mode]) => creneauMode(mode))}
                    icones={byMethod.map(([mode]) => ICONES_MODE[mode] ?? CircleDollarSign)}
                    lignes={byMethod.map(([method, amount]: any) => ({
                      libelle: libelleMode(t, method),
                      valeur: Number(amount),
                    }))}
                    /* Deux décimales ici, une seule sur les cartes : c'est le
                       seul bloc où l'on met les valeurs en regard les unes des
                       autres, et « 5,4 M » contre « 5,4 M » ne dirait plus
                       laquelle domine. Le pourcentage répond à la question
                       réellement posée — quelle part de ce qui est rentré. */
                    format={(v) => `${montantAbrege(v, 2)} (${pourcentage(v, totalEncaisse)})`}
                  />
                )}
            </CarteBloc>
          </div>
        )}

        {blocVisible('lots') && (
          <div className="lg:col-span-3">
            <CarteBloc
              titre={t('dashboard.expiringLots')}
              lienVers="/stock"
              lienLibelle={t('dashboard.voirLots')}
            >
              <div className="space-y-1.5">
                {expiring.length === 0
                  ? <EtatVide compact texte={t('dashboard.noExpiringLots')} />
                  : expiring.slice(0, 6).map((e: any) => (
                    <div
                      key={e.stockEntryId}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground">{e.name}</span>
                      <Badge point variant={e.daysUntilExpiry <= 7 ? 'destructive' : 'warning'}>
                        {t('dashboard.inDays', { count: e.daysUntilExpiry })}
                      </Badge>
                    </div>
                  ))}
              </div>
            </CarteBloc>
          </div>
        )}
      </div>
    </div>
  );
}
