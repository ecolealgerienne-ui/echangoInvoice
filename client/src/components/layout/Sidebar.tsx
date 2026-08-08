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
import { teinteFiliere, type Filiere } from '@/lib/filieres';
import { Avatar } from '@/components/shared/Avatar';
import { Deroulant, EntreeDeroulant } from '@/components/shared/Deroulant';

/**
 * Barre latérale.
 *
 * Vingt entrées en gris, réparties en cinq métiers, se lisaient comme une
 * liste de courses : le regard descendait mot à mot pour retrouver « Avoirs ».
 * Chaque groupe porte maintenant sa teinte de filière — ventes en azur,
 * catalogue en sarcelle, achats en violet, production en ambre, finance en
 * magenta — et c'est l'**icône** qui la porte, jamais le libellé.
 *
 * Ce partage n'est pas cosmétique. Une couleur de filière posée sur du texte
 * plafonnerait autour de 3:1 sur son propre fond ténu ; posée sur une icône,
 * elle n'a rien à faire lire. Le libellé garde donc l'encre de la barre, et la
 * couleur travaille sur la forme — c'est aussi ce qui la rend reconnaissable du
 * coin de l'œil, sans lecture.
 *
 * L'élément actif reçoit trois signaux plutôt qu'un fond seul : la barre
 * verticale du côté de la lecture, le fond ténu de sa filière, et l'encre
 * forte. Trois signaux valent mieux qu'un pour la même raison que les pastilles
 * de statut portent un point en plus de leur couleur.
 */

interface Groupe {
  key: string;
  filiere: Filiere;
  items: { to: string; icon: React.ElementType; key: string }[];
}

const groups: Groupe[] = [
  {
    key: 'nav.group.sales',
    filiere: 'ventes',
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
    filiere: 'catalogue',
    items: [
      { to: '/products', icon: Box, key: 'nav.products' },
      { to: '/price-lists', icon: Tags, key: 'nav.priceLists' },
      { to: '/stock', icon: Layers, key: 'nav.stock' },
    ],
  },
  {
    key: 'nav.group.purchases',
    filiere: 'achats',
    items: [
      { to: '/suppliers', icon: Truck, key: 'nav.suppliers' },
      { to: '/purchases', icon: ShoppingCart, key: 'nav.purchases' },
      { to: '/purchases/vendor-bills', icon: Receipt, key: 'nav.vendorBills' },
    ],
  },
  {
    key: 'nav.group.production',
    filiere: 'production',
    items: [
      { to: '/production', icon: Factory, key: 'nav.production' },
    ],
  },
  {
    key: 'nav.group.finance',
    filiere: 'finance',
    items: [
      { to: '/expenses', icon: Receipt, key: 'nav.expenses' },
      { to: '/reports', icon: BarChart2, key: 'nav.reports' },
    ],
  },
];

const adminGroups: Groupe[] = [
  {
    key: 'nav.admin.group',
    filiere: 'achats',
    items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, key: 'nav.admin.dashboard' },
      { to: '/admin/tenants', icon: Building2, key: 'nav.admin.tenants' },
      { to: '/admin/plans', icon: CreditCard, key: 'nav.admin.plans' },
    ],
  },
];

/** Une entrée de navigation. Le rendu de l'état actif est écrit une fois. */
function Entree({
  to, icon: Icone, libelle, filiere, repliee,
}: {
  to: string; icon: React.ElementType; libelle: string; filiere: Filiere;
  /** Barre repliée : le libellé disparaît, l'infobulle le rend au survol. */
  repliee?: boolean;
}) {
  const teinte = teinteFiliere(filiere);

  return (
    <NavLink
      to={to}
      title={repliee ? libelle : undefined}
      className={({ isActive }) =>
        cn(
          'group/entree relative flex items-center gap-3 rounded-md py-2 text-sm font-medium',
          repliee ? 'justify-center px-2' : 'px-3',
          'transition-[background-color,color,transform] duration-150 ease-ci',
          isActive
            ? cn(teinte.fond, 'text-sidebar-accent-foreground')
            : 'text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground motion-safe:hover:translate-x-0.5',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* La barre du côté de la lecture. Elle grandit depuis le centre
              plutôt que d'apparaître : c'est ce qui fait qu'on la remarque
              lorsqu'on navigue au clavier. */}
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-1.5 start-0 w-[3px] rounded-full transition-transform duration-200 ease-ci',
              teinte.barre,
              isActive ? 'scale-y-100' : 'scale-y-0',
            )}
          />
          <Icone
            className={cn(
              'h-4 w-4 shrink-0 transition-colors duration-150',
              isActive ? teinte.texte : cn(teinte.texte, 'opacity-65 group-hover/entree:opacity-100'),
            )}
          />
          {!repliee && libelle}
        </>
      )}
    </NavLink>
  );
}

/** Intitulé de groupe, précédé d'un tiret de la couleur du métier. */
function TitreGroupe({ libelle, filiere }: { libelle: string; filiere: Filiere }) {
  return (
    <p className="mb-1 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground">
      <span aria-hidden className={cn('h-px w-3 rounded-full', teinteFiliere(filiere).barre)} />
      {libelle}
    </p>
  );
}

const CLE_REPLI = 'echango-barre-repliee';

export function Sidebar() {
  const { t } = useTranslation();
  const { user, logout, isSuperAdmin } = useAuth();
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
        repliee ? 'w-16' : 'w-56',
      )}
    >
      {/* Voile vertical : la barre s'ancre en bas au lieu de flotter. Il est
          posé en arrière-plan et n'intercepte rien. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-filiere-finance/[0.06]"
      />

      <div className="relative border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2.5">
          <MarqueEchango />
          {!repliee && (
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-sidebar-accent-foreground">
              Echango Invoice
            </h1>
          )}
          {/* Le bouton de repli est posé contre le logo, comme dans la
              maquette : c'est le seul endroit de la barre où l'on est sûr
              qu'aucune entrée de navigation ne viendra le pousser. Replié, il
              passe sous le logo faute de place à côté. */}
          <button
            type="button"
            onClick={basculerRepli}
            aria-label={t(repliee ? 'nav.deplier' : 'nav.replier')}
            title={t(repliee ? 'nav.deplier' : 'nav.replier')}
            aria-expanded={!repliee}
            className={cn(
              'shrink-0 rounded-md p-1.5 text-sidebar-foreground transition-colors duration-150',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
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
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-warning-subtle px-1.5 py-0.5 text-[10px] font-semibold text-warning-text">
            <Shield className="h-3 w-3" /> Superadmin
          </span>
        )}
      </div>

      <nav className={cn('relative flex-1 overflow-y-auto overflow-x-hidden py-3', repliee ? 'mt-6 px-2' : 'px-2')}>
        {isSuperAdmin ? (
          adminGroups.map((groupe) => (
            <div key={groupe.key} className="mt-3">
              {!repliee && <TitreGroupe libelle={t(groupe.key)} filiere={groupe.filiere} />}
              <div className="space-y-0.5">
                {groupe.items.map(({ to, icon, key }) => (
                  <Entree key={to} to={to} icon={icon} libelle={t(key)} filiere={groupe.filiere} repliee={repliee} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <>
            <div className="mb-1">
              <Entree to="/dashboard" icon={LayoutDashboard} libelle={t('nav.dashboard')} filiere="ventes" repliee={repliee} />
            </div>

            {visibles.map((groupe) => (
              <div key={groupe.key} className="mt-3">
                {/* Replié, l'intitulé de groupe est remplacé par un filet de sa
                    teinte : le mot ne tiendrait pas, mais la césure entre deux
                    métiers doit rester visible. */}
                {repliee
                  ? <span aria-hidden className={cn('mx-auto mb-1.5 block h-px w-6 rounded-full', teinteFiliere(groupe.filiere).barre)} />
                  : <TitreGroupe libelle={t(groupe.key)} filiere={groupe.filiere} />}
                <div className="space-y-0.5">
                  {groupe.items.map(({ to, icon, key }) => (
                    <Entree key={to} to={to} icon={icon} libelle={t(key)} filiere={groupe.filiere} repliee={repliee} />
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
    <div className="relative border-t border-sidebar-border p-2">
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
              'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              ouvert && 'bg-sidebar-accent',
            )}
          >
            <Avatar nom={user.name} />
            {!repliee && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-sidebar-accent-foreground">
                    {user.name}
                  </span>
                  <span className="block truncate text-2xs text-sidebar-foreground">{role}</span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground" aria-hidden />
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
 * Le carré plein est devenu un dégradé diagonal azur → sarcelle : deux des six
 * familles du système, dans l'ordre. Un logo monochrome dans une interface qui
 * revendique la couleur se lit comme un oubli.
 */
function MarqueEchango() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 drop-shadow-sm" aria-hidden>
      <defs>
        <linearGradient id="marque-echango" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(var(--ci-serie-1))" />
          <stop offset="100%" stopColor="oklch(var(--ci-serie-4))" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#marque-echango)" />
      <path
        d="M7 8.5h10M7 12h7M7 15.5h10"
        className="stroke-primary-foreground"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
