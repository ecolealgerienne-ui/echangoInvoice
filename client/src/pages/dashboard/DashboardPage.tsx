import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, TrendingDown, FileText, Package, DollarSign,
  AlertTriangle, Clock, Percent, Minus,
} from 'lucide-react';
import { dashboardApi } from '@/lib/api';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { SelecteurPeriode, periodeParDefaut } from '@/components/shared/SelecteurPeriode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EtatVide } from '@/components/shared/EtatVide';
import { SqueletteCarte, SqueletteGraphique, SqueletteIndicateur } from '@/components/ui/Squelette';
import { BarresClassement, Composition, CourbeAire, Sparkline } from '@/components/ui/Graphique';
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
        {valeur > 0 ? '+' : ''}{valeur}&nbsp;%
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
 */
function CarteIndicateur({
  titre, valeur, format, sub, icon: Icone, filiere, evolution, evolutionInverse, tendance,
}: {
  titre: string;
  valeur: number;
  format: (v: number) => string;
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
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
              {format(anime)}
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

/** Une ligne d'alerte : un bloc teinté de sa gravité, un nombre qui pèse. */
function LigneAlerte({
  libelle, nombre, icon: Icone, gravite, muet,
}: {
  libelle: string;
  nombre: number;
  icon: React.ElementType;
  gravite: 'warning' | 'destructive';
  muet: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150',
        muet && 'border-border bg-muted/40',
        !muet && gravite === 'warning' && 'border-warning/35 bg-warning-subtle',
        !muet && gravite === 'destructive' && 'border-destructive/35 bg-destructive-subtle',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icone
          className={cn(
            'h-4 w-4 shrink-0',
            muet ? 'text-muted-foreground' : gravite === 'warning' ? 'text-warning' : 'text-destructive',
          )}
          aria-hidden
        />
        <span className={cn('truncate text-sm', muet ? 'text-muted-foreground' : 'text-foreground')}>
          {libelle}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 text-lg font-bold tabular-nums',
          muet ? 'text-muted-foreground' : gravite === 'warning' ? 'text-warning-text' : 'text-destructive-text',
        )}
      >
        {nombre}
      </span>
    </div>
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
  const topStock: any[] = (stockChart?.byRawMaterial ?? []).slice(0, 8);
  const expiring: any[] = stockChart?.expiringWithin30Days ?? [];
  const categories = Object.entries(expenses.byCategory) as [string, number][];
  const tendanceCa = byDate.map((d: any) => Number(d.revenue));

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
          format={(v) => formatCurrency(v)}
          evolution={stats.evolution?.revenue}
          sub={`${sales.invoiceCount} ${t('dashboard.invoiceCount').toLowerCase()}`}
          icon={DollarSign}
          filiere="ventes"
          tendance={tendanceCa}
        />
        <CarteIndicateur
          titre={t('dashboard.grossMargin')}
          valeur={Number(profit.grossMargin)}
          format={(v) => formatCurrency(v)}
          sub={`${profit.grossMarginPercent}%`}
          icon={Percent}
          filiere="finance"
        />
        <CarteIndicateur
          titre={t('dashboard.netProfit')}
          valeur={Number(profit.netProfit)}
          format={(v) => formatCurrency(v)}
          evolution={stats.evolution?.netProfit}
          sub={`${profit.netProfitPercent}%`}
          icon={TrendingUp}
          filiere="achats"
        />
        <CarteIndicateur
          titre={t('dashboard.stockValue')}
          valeur={Number(stock.totalStockValue)}
          format={(v) => formatCurrency(v)}
          icon={Package}
          filiere="catalogue"
        />
      </div>

      <div className="echelonner grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Dépenses, en composition */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.expenses')}</CardTitle></CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <EtatVide compact texte={t('common.videTexte')} />
            ) : (
              <>
                <Composition
                  parts={categories.map(([cat, montant]) => ({
                    libelle: t(`expenses.categories.${cat}`),
                    valeur: Number(montant),
                  }))}
                  total={Number(expenses.totalExpenses)}
                  format={(v) => formatCurrency(v)}
                />
                <div className="mt-3 flex justify-between border-t border-border pt-2.5 text-sm font-semibold">
                  <span>{t('common.total')}</span>
                  <span className="tabular-nums">{formatCurrency(expenses.totalExpenses)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top clients : un classement — teinte unique, rangs numérotés. */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.topCustomers')}</CardTitle></CardHeader>
          <CardContent>
            {sales.topCustomers.length === 0 ? (
              <EtatVide compact texte={t('common.videTexte')} />
            ) : (
              <BarresClassement
                serie={0}
                lignes={sales.topCustomers.map((c: any) => ({
                  libelle: c.name,
                  valeur: Number(c.total),
                }))}
                format={(v) => formatCurrency(v)}
              />
            )}
          </CardContent>
        </Card>

        {/* Alertes */}
        <Card vivante>
          <CardHeader><CardTitle>{t('dashboard.alerts')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <LigneAlerte
              libelle={t('dashboard.expiringSoon')}
              nombre={alerts.expiringStockCount}
              icon={Clock}
              gravite="warning"
              muet={alerts.expiringStockCount === 0}
            />
            <LigneAlerte
              libelle={t('dashboard.unpaidInvoices')}
              nombre={alerts.unpaidInvoicesCount}
              icon={FileText}
              gravite="destructive"
              muet={alerts.unpaidInvoicesCount === 0}
            />
            <LigneAlerte
              libelle={t('dashboard.lowStock')}
              nombre={alerts.lowStockCount}
              icon={AlertTriangle}
              gravite="warning"
              muet={alerts.lowStockCount === 0}
            />
            {alerts.unpaidInvoicesTotal > 0 && (
              <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
                <span>{t('dashboard.unpaidTotal')}</span>
                <span className="font-semibold tabular-nums text-destructive-text">
                  {formatCurrency(alerts.unpaidInvoicesTotal)}
                </span>
              </div>
            )}
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
                  format={(v) => formatCurrency(v)}
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
                  lignes={topStock.map((r: any) => ({
                    libelle: r.name,
                    valeur: Number(r.stockValue),
                  }))}
                  format={(v) => formatCurrency(v)}
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
