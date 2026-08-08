import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, TrendingDown, FileText, Package, DollarSign,
  AlertTriangle, Percent, Minus, ChevronRight, Hourglass, Wallet,
} from 'lucide-react';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { ecartPourcent, montantAbrege, pourcentage } from '@/lib/montants';
import { SelecteurPeriode, periodeParDefaut } from '@/components/shared/SelecteurPeriode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EtatVide } from '@/components/shared/EtatVide';
import { SqueletteCarte, SqueletteGraphique, SqueletteIndicateur } from '@/components/ui/Squelette';
import { BarresClassement, CourbeAire, Sparkline } from '@/components/ui/Graphique';
import { useCompteurAnime } from '@/hooks/useCompteurAnime';
import { teinteFiliere, type Filiere } from '@/lib/filieres';
import { creneauMode } from '@/lib/modesReglement';

/**
 * Tableau de bord.
 *
 * C'était l'écran le plus gris du produit : quatre chiffres dans quatre cadres
 * blancs, trois listes de couples « intitulé — montant », et une courbe bleue.
 * Rien n'y hiérarchisait quoi que ce soit, et surtout rien n'y répondait à la
 * question qu'on se pose en l'ouvrant — *est-ce que ça va ?*
 *
 * Trois changements y répondent :
 *
 * - **les indicateurs comptent.** Le montant monte jusqu'à sa valeur en huit
 *   dixièmes de seconde. L'ordre de grandeur se perçoit pendant la montée, et
 *   le regard est attiré à l'instant où le chiffre se fige. La pastille
 *   d'icône porte le dégradé de sa filière : quatre cartes identiques ne se
 *   distinguaient que par leur intitulé, lu de haut en bas ;
 *
 * - **les dépenses deviennent une composition.** Six lignes de montants
 *   obligeaient à faire la division de tête pour savoir si le loyer pesait un
 *   dixième ou un tiers. Une barre découpée le dit sans calcul, et la légende
 *   garde le montant exact ;
 *
 * - **les alertes cessent d'être une liste.** Chacune est un bloc teinté de sa
 *   gravité, et le nombre y est gros. Une alerte à zéro reste affichée mais
 *   passe au neutre : savoir qu'il n'y a rien est une information.
 *
 * Sur le chargement, des squelettes remplacent le disque qui tourne : la mise
 * en page ne bouge plus quand les données arrivent.
 */

/**
 * Écart par rapport à la période précédente.
 *
 * `null` quand la référence est nulle : le serveur ne rend alors aucun
 * pourcentage, parce qu'aucun n'aurait de sens — et un « 0 % » se lirait comme
 * une stagnation alors qu'on part de rien.
 *
 * L'écart est devenu une pastille au lieu d'une ligne de texte colorée : sur
 * fond ténu, la couleur porte plus loin, et la flèche double le signal pour
 * qui distingue mal le rouge du vert.
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
  titre, valeur, sub, icon: Icone, filiere, evolution, evolutionInverse, tendance,
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
      <CardContent className="relative p-5">
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
          <span className="block truncate text-sm text-foreground">{libelle}</span>
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

export function DashboardPage() {
  const { t } = useTranslation();
  const [periode, setPeriode] = useState(periodeParDefaut());

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', periode],
    queryFn: () => dashboardApi.stats(periode),
  });

  const { data: salesChartData } = useQuery({
    queryKey: ['dashboard-sales-chart', periode],
    queryFn: () => dashboardApi.salesChart(periode),
  });

  // Pas de période en paramètre : le stock est une photo à l'instant t.
  const { data: stockChartData } = useQuery({
    queryKey: ['dashboard-stock-chart'],
    queryFn: () => dashboardApi.stockChart(),
  });

  const salesChart = salesChartData?.data;
  const stockChart = stockChartData?.data;
  const byDate: any[] = salesChart?.byDate ?? [];

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
  const topStock: any[] = (stockChart?.byRawMaterial ?? []).slice(0, 8);
  const expiring: any[] = stockChart?.expiringWithin30Days ?? [];
  // Une catégorie à zéro n'a pas de barre à montrer : elle allongeait le bloc
  // sans rien y mettre.
  const categories = (Object.entries(expenses.byCategory) as [string, number][])
    .filter(([, montant]) => Number(montant) > 0);
  const tendanceCa = byDate.map((d: any) => Number(d.revenue));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">{t('dashboard.title')}</h1>
        <SelecteurPeriode valeur={periode} onChange={setPeriode} />
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
        <CarteIndicateur
          titre={t('dashboard.stockValue')}
          valeur={Number(stock.totalStockValue)}
          icon={Package}
          filiere="catalogue"
        />
      </div>

      <div className="echelonner grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Dépenses.
            Le total est passé **en tête** et non plus en pied : c'est le
            chiffre qu'on vient chercher, et il se lisait après six lignes de
            détail. Les catégories sont ensuite des barres — la longueur dit la
            part, ce que faisait auparavant un pourcentage imprimé à côté du
            montant. Les deux ensemble étaient une redite, et une ligne de
            trois nombres se lit trois fois plus lentement qu'une barre. */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.expenses')}</CardTitle></CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <EtatVide compact texte={t('common.videTexte')} />
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('common.total')}
                  </p>
                  <p
                    className="mt-0.5 cursor-help text-xl font-bold tabular-nums text-foreground"
                    title={formatCurrency(expenses.totalExpenses)}
                  >
                    {montantAbrege(expenses.totalExpenses)}
                  </p>
                </div>
                {/* Les catégories de dépense sont des entités fixes : chacune
                    garde son créneau de couleur d'un mois à l'autre, comme les
                    modes de règlement. */}
                <BarresClassement
                  teintes={categories.map(([, ], i) => i)}
                  lignes={categories.map(([cat, montant]) => ({
                    libelle: t(`expenses.categories.${cat}`),
                    valeur: Number(montant),
                  }))}
                  format={(v) => montantAbrege(v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top clients : un classement — teinte unique, rangs numérotés, et
            l'écart avec la période précédente quand le serveur sait le
            calculer. */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.topCustomers')}</CardTitle></CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* À traiter */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.toDo')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>
      </div>

      {/* ── Graphiques ──────────────────────────────────────────────────── */}
      <div className="echelonner grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card vivante voile>
          <CardHeader><CardTitle>{t('dashboard.revenueByDay')}</CardTitle></CardHeader>
          <CardContent>
            {byDate.length === 0
              ? <EtatVide compact texte={t('common.videTexte')} />
              : (
                <CourbeAire
                  serie={0}
                  points={byDate.map((d: any) => ({
                    libelle: formatDate(d.date),
                    valeur: Number(d.revenue),
                  }))}
                  format={(v) => formatCurrency(v)}
                />
              )}
          </CardContent>
        </Card>

        {/* Modes de règlement : quatre entités fixes, donc quatre créneaux de
            couleur fixes — le créneau vient de la position du mode dans sa
            liste de référence, jamais de son rang du mois. */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.byPaymentMethod')}</CardTitle></CardHeader>
          <CardContent>
            {maxMethod === 0
              ? <EtatVide compact texte={t('common.videTexte')} />
              : (
                <BarresClassement
                  teintes={byMethod.map(([mode]) => creneauMode(mode))}
                  lignes={byMethod.map(([method, amount]: any) => ({
                    libelle: t(`invoices.methods.${method}`),
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
          </CardContent>
        </Card>

        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.stockByProduct')}</CardTitle></CardHeader>
          <CardContent>
            {topStock.length === 0
              ? <EtatVide compact texte={t('common.videTexte')} />
              : (
                <BarresClassement
                  serie={3}
                  rangs
                  lignes={topStock.map((r: any) => ({
                    libelle: r.name,
                    valeur: Number(r.stockValue),
                  }))}
                  format={(v) => montantAbrege(v)}
                />
              )}
          </CardContent>
        </Card>

        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.expiringLots')}</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {expiring.length === 0
              ? <EtatVide compact texte={t('dashboard.noExpiringLots')} />
              : expiring.slice(0, 8).map((e: any) => (
                <div
                  key={e.stockEntryId}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{e.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {e.quantity} {e.unit}
                  </span>
                  <Badge point variant={e.daysUntilExpiry <= 7 ? 'destructive' : 'warning'}>
                    {t('dashboard.inDays', { count: e.daysUntilExpiry })}
                  </Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
