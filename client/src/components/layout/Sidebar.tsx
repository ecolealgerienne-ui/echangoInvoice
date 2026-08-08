import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Truck, Box, Layers,
  FileText, BarChart2, Settings, LogOut, ClipboardList,
  FileSignature, ShoppingCart, Receipt, Factory,
  Shield, Building2, CreditCard, FileMinus, Tags,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { settingsApi } from '@/lib/api';
import { teinteFiliere, type Filiere } from '@/lib/filieres';

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
  to, icon: Icone, libelle, filiere,
}: { to: string; icon: React.ElementType; libelle: string; filiere: Filiere }) {
  const teinte = teinteFiliere(filiere);

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group/entree relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
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
          {libelle}
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

export function Sidebar() {
  const { t } = useTranslation();
  const { user, logout, isSuperAdmin } = useAuth();
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
    enabled: !isSuperAdmin,
  });
  const productionEnabled = settingsData?.data?.productionModuleEnabled ?? false;
  const visibles = groups.filter((g) => g.key !== 'nav.group.production' || productionEnabled);

  return (
    <aside className="relative flex h-screen w-56 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Voile vertical : la barre s'ancre en bas au lieu de flotter. Il est
          posé en arrière-plan et n'intercepte rien. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-filiere-finance/[0.06]"
      />

      <div className="relative border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <MarqueEchango />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-sidebar-accent-foreground">
              Echango Invoice
            </h1>
            {user && <p className="truncate text-2xs text-sidebar-foreground">{user.email}</p>}
          </div>
        </div>
        {isSuperAdmin && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-warning-subtle px-1.5 py-0.5 text-[10px] font-semibold text-warning-text">
            <Shield className="h-3 w-3" /> Superadmin
          </span>
        )}
      </div>

      <nav className="relative flex-1 overflow-y-auto px-2 py-3">
        {isSuperAdmin ? (
          adminGroups.map((groupe) => (
            <div key={groupe.key} className="mt-3">
              <TitreGroupe libelle={t(groupe.key)} filiere={groupe.filiere} />
              <div className="space-y-0.5">
                {groupe.items.map(({ to, icon, key }) => (
                  <Entree key={to} to={to} icon={icon} libelle={t(key)} filiere={groupe.filiere} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <>
            <div className="mb-1">
              <Entree to="/dashboard" icon={LayoutDashboard} libelle={t('nav.dashboard')} filiere="ventes" />
            </div>

            {visibles.map((groupe) => (
              <div key={groupe.key} className="mt-3">
                <TitreGroupe libelle={t(groupe.key)} filiere={groupe.filiere} />
                <div className="space-y-0.5">
                  {groupe.items.map(({ to, icon, key }) => (
                    <Entree key={to} to={to} icon={icon} libelle={t(key)} filiere={groupe.filiere} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </nav>

      <div className="relative space-y-0.5 border-t border-sidebar-border px-2 py-3">
        <Entree to="/settings" icon={Settings} libelle={t('nav.settings')} filiere="catalogue" />
        <button
          onClick={logout}
          className={cn(
            'group/entree flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
            'text-sidebar-foreground transition-colors duration-150',
            'hover:bg-destructive-subtle hover:text-destructive-text',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-65 transition-opacity group-hover/entree:opacity-100" />
          {t('auth.logout')}
        </button>
      </div>
    </aside>
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
