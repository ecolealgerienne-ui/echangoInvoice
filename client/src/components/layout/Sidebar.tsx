import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Truck, Box, Layers,
  FileText, BarChart2, Settings, LogOut, ClipboardList,
  FileSignature, ShoppingCart, Receipt, Factory,
  Shield, Building2, CreditCard, FileMinus, Tags,
  PanelLeftClose, PanelLeftOpen, ChevronsUpDown,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { settingsApi } from '@/lib/api';
import { Avatar } from '@/components/shared/Avatar';
import { Deroulant, EntreeDeroulant } from '@/components/shared/Deroulant';

/**
 * Barre latérale.
 *
 * Deux cent huit pixels, le fond `bg-sidebar` — un cran entre la page et la
 * carte — et une bordure à droite. Les entrées font trente-six pixels de haut,
 * dix de rembourrage, sept de rayon, treize pixels de texte.
 *
 * ── Une seule couleur forte, et c'est ici ────────────────────────────────
 *
 * Chaque groupe portait la teinte de son métier — ventes en azur, catalogue en
 * sarcelle, achats en violet, production en ambre, finance en magenta — et
 * cette teinte colorait l'icône de chaque entrée, le filet du titre de groupe,
 * la barre de l'élément actif et son fond. L'intention était juste : vingt
 * entrées en gris se lisent comme une liste de courses.
 *
 * La spécification tranche autrement, et il faut l'assumer entièrement : **la
 * barre latérale n'a qu'un aplat vraiment coloré, l'entrée active.** Le reste
 * est gris. C'est le prix du dosage — 70 % de bleu-noir, 20 % de primaire,
 * 10 % de sémantique — et cinq teintes réparties sur vingt icônes le crevaient
 * à elles seules. Ce qu'on perd en repérage périphérique, on le regagne
 * ailleurs : l'entrée active, qui était un fond ténu parmi cinq teintes, est
 * maintenant le seul objet coloré de la colonne. On la trouve sans la chercher.
 *
 * Les groupes restent, et leur intitulé aussi : c'est lui qui découpe les
 * vingt entrées en cinq métiers, et il le fait sans dépenser de couleur.
 */

interface Groupe {
  key: string;
  items: { to: string; icon: React.ElementType; key: string }[];
}

const groups: Groupe[] = [
  {
    key: 'nav.group.sales',
    items: [
      { to: '/customers', icon: Users, key: 'nav.customers' },
      { to: '/quotes', icon: FileSignature, key: 'nav.quotes' },
      { to: '/invoices', icon: FileText, key: 'nav.invoices' },
      { to: '/deliveries', icon: ClipboardList, key: 'nav.deliveries' },
      { to: '/credit-notes', icon: FileMinus, key: 'nav.creditNotes' },
    ],
  },
  {
    key: 'nav.group.catalog',
    items: [
      { to: '/products', icon: Box, key: 'nav.products' },
      { to: '/price-lists', icon: Tags, key: 'nav.priceLists' },
      { to: '/stock', icon: Layers, key: 'nav.stock' },
    ],
  },
  {
    key: 'nav.group.purchases',
    items: [
      { to: '/suppliers', icon: Truck, key: 'nav.suppliers' },
      { to: '/purchases', icon: ShoppingCart, key: 'nav.purchases' },
      { to: '/purchases/vendor-bills', icon: Receipt, key: 'nav.vendorBills' },
    ],
  },
  {
    key: 'nav.group.production',
    items: [
      { to: '/production', icon: Factory, key: 'nav.production' },
    ],
  },
  {
    key: 'nav.group.finance',
    items: [
      { to: '/expenses', icon: Receipt, key: 'nav.expenses' },
      { to: '/reports', icon: BarChart2, key: 'nav.reports' },
    ],
  },
];

const adminGroups: Groupe[] = [
  {
    key: 'nav.admin.group',
    items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, key: 'nav.admin.dashboard' },
      { to: '/admin/tenants', icon: Building2, key: 'nav.admin.tenants' },
      { to: '/admin/plans', icon: CreditCard, key: 'nav.admin.plans' },
    ],
  },
];

/**
 * Une entrée de navigation.
 *
 * Trois états, et ils ne se ressemblent pas : au repos, l'encre secondaire sur
 * rien ; au survol, la surface de survol et l'encre pleine ; actif, l'aplat
 * plein de `sidebar-actif` et l'encre claire. L'icône suit l'encre du libellé
 * — elle ne porte plus de couleur propre.
 */
function Entree({
  to, icon: Icone, libelle, repliee,
}: {
  to: string; icon: React.ElementType; libelle: string;
  /** Barre repliée : le libellé disparaît, l'infobulle le rend au survol. */
  repliee?: boolean;
}) {
  return (
    <NavLink
      to={to}
      title={repliee ? libelle : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-2.5 rounded-md text-sm font-medium',
          repliee ? 'justify-center px-2' : 'px-2.5',
          'transition-[background-color,color] duration-150 ease-ci',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'bg-sidebar-actif text-sidebar-actif-foreground'
            : 'text-sidebar-foreground hover:bg-surface-hover hover:text-foreground',
        )
      }
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden />
      {!repliee && <span className="truncate">{libelle}</span>}
    </NavLink>
  );
}

/** Intitulé de groupe : dix pixels, majuscules, chasse ouverte, encre tertiaire. */
function TitreGroupe({ libelle }: { libelle: string }) {
  return (
    <p className="mb-1 px-2.5 text-3xs font-medium uppercase text-tertiaire">{libelle}</p>
  );
}

const CLE_REPLI = 'echango-barre-repliee';

export function Sidebar() {
  const { t } = useTranslation();
  const { isSuperAdmin } = useAuth();
  // Le repli est un réglage de poste, pas de session : celui qui travaille sur
  // un portable de treize pouces le choisit une fois.
  const [repliee, setRepliee] = useState(() => localStorage.getItem(CLE_REPLI) === '1');

  function basculerRepli() {
    setRepliee((r) => {
      localStorage.setItem(CLE_REPLI, r ? '0' : '1');
      return !r;
    });
  }

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
    enabled: !isSuperAdmin,
  });
  const productionEnabled = settingsData?.data?.productionModuleEnabled ?? false;
  const visibles = groups.filter((g) => g.key !== 'nav.group.production' || productionEnabled);

  return (
    <aside
      className={cn(
        'relative flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        'transition-[width] duration-200 ease-ci',
        repliee ? 'w-16' : 'w-52',
      )}
    >
      {/* L'en-tête de la barre a la hauteur de l'en-tête de la page — soixante-
          quatre pixels — pour que le logo et le titre de l'écran partagent leur
          ligne de base. C'est la première chose qu'on voit de travers quand
          elle manque. */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3">
        <MarqueEchango />
        {!repliee && (
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground">
            Echango Invoice
          </h1>
        )}
        <button
          type="button"
          onClick={basculerRepli}
          aria-label={t(repliee ? 'nav.deplier' : 'nav.replier')}
          title={t(repliee ? 'nav.deplier' : 'nav.replier')}
          aria-expanded={!repliee}
          className={cn(
            'shrink-0 rounded-md p-1.5 text-tertiaire transition-colors duration-150',
            'hover:bg-surface-hover hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            repliee && 'absolute end-1 top-16',
          )}
        >
          {repliee
            ? <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" aria-hidden />
            : <PanelLeftClose className="h-4 w-4 rtl:rotate-180" aria-hidden />}
        </button>
      </div>

      {isSuperAdmin && !repliee && (
        <div className="px-3 pt-3">
          <span className="inline-flex items-center gap-1 rounded-sm bg-warning-subtle px-2 py-[3px] text-3xs font-semibold text-warning-text">
            <Shield className="h-3 w-3" /> Superadmin
          </span>
        </div>
      )}

      <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-3', repliee ? 'mt-6 px-2' : 'px-2')}>
        {isSuperAdmin ? (
          adminGroups.map((groupe) => (
            <div key={groupe.key} className="mt-3">
              {!repliee && <TitreGroupe libelle={t(groupe.key)} />}
              <div className="space-y-0.5">
                {groupe.items.map(({ to, icon, key }) => (
                  <Entree key={to} to={to} icon={icon} libelle={t(key)} repliee={repliee} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <>
            <div className="mb-1">
              <Entree to="/dashboard" icon={LayoutDashboard} libelle={t('nav.dashboard')} repliee={repliee} />
            </div>

            {visibles.map((groupe) => (
              <div key={groupe.key} className="mt-4">
                {/* Replié, l'intitulé de groupe est remplacé par un filet : le
                    mot ne tiendrait pas, mais la césure entre deux métiers doit
                    rester visible. */}
                {repliee
                  ? <span aria-hidden className="mx-auto mb-1.5 block h-px w-6 rounded-full bg-border" />
                  : <TitreGroupe libelle={t(groupe.key)} />}
                <div className="space-y-0.5">
                  {groupe.items.map(({ to, icon, key }) => (
                    <Entree key={to} to={to} icon={icon} libelle={t(key)} repliee={repliee} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </nav>

      <BlocUtilisateur repliee={repliee} />
    </aside>
  );
}

/**
 * Bloc utilisateur, en pied de barre.
 *
 * L'adresse de courrier était écrite en haut, sous le nom du produit, et les
 * deux entrées qui la concernent — « Paramètres », « Déconnexion » — vivaient
 * en bas, mêlées à la navigation. Rien ne les reliait, et « Déconnexion »
 * occupait dans la liste des écrans une place aussi grande que « Factures ».
 *
 * Le pied les rassemble en un seul objet : qui je suis, à quel titre, et ce que
 * je peux faire de mon compte. C'est la convention de tous les outils de
 * gestion, et elle rend à la navigation deux lignes qui ne sont pas des écrans.
 *
 * L'adresse cède la place au **rôle** : sur un poste partagé, savoir qu'on est
 * connecté en gestionnaire plutôt qu'en propriétaire explique pourquoi un bouton
 * manque — l'adresse, elle, ne l'explique pas. Elle reste dans le menu.
 */
function BlocUtilisateur({ repliee }: { repliee: boolean }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  const role = t(`users.roles.${user.role}`);

  return (
    <div className="border-t border-sidebar-border p-2">
      <Deroulant
        largeur="w-52"
        aligne="start"
        // Le panneau s'ouvre **vers le haut** : sous le bouton, il sortirait de
        // la fenêtre, puisque le bloc est collé au bas de l'écran.
        className="bottom-full mb-1"
        declencheur={({ ouvert, basculer }) => (
          <button
            type="button"
            onClick={basculer}
            aria-haspopup="menu"
            aria-expanded={ouvert}
            title={repliee ? `${user.name} — ${role}` : undefined}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md py-2 text-start transition-colors duration-150',
              repliee ? 'justify-center px-1' : 'px-2',
              'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              ouvert && 'bg-surface-hover',
            )}
          >
            <Avatar nom={user.name} />
            {!repliee && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">
                    {user.name}
                  </span>
                  <span className="block truncate text-2xs text-tertiaire">{role}</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-tertiaire" aria-hidden />
              </>
            )}
          </button>
        )}
      >
        <p className="truncate px-2.5 pb-1.5 pt-1 text-2xs text-muted-foreground" title={user.email}>
          {user.email}
        </p>
        <div className="mb-1 h-px bg-border" aria-hidden />
        <EntreeDeroulant icone={Settings} to="/settings">{t('nav.settings')}</EntreeDeroulant>
        <EntreeDeroulant icone={LogOut} danger onSelect={logout}>{t('auth.logout')}</EntreeDeroulant>
      </Deroulant>
    </div>
  );
}

/**
 * Marque dessinée en SVG : nette à toute taille, et elle suit le thème.
 *
 * Le carré est un aplat de la primaire, plus un dégradé de deux familles. Dans
 * un système qui réserve la couleur pleine à trois endroits, le logo est le
 * quatrième par nature — mais il n'a pas à inventer une teinte de plus.
 */
function MarqueEchango() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden>
      <rect width="24" height="24" rx="7" className="fill-primary" />
      <path
        d="M7 8.5h10M7 12h7M7 15.5h10"
        className="stroke-primary-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
