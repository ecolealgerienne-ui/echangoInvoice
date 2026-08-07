import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Truck, Box, Layers,
  FileText, BarChart2, Settings, LogOut, ClipboardList,
  FileSignature, ShoppingCart, Receipt, Factory,
  Shield, Building2, CreditCard, FileMinus, Boxes,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { settingsApi } from '@/lib/api';

const groups = [
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
      { to: '/raw-materials', icon: Boxes, key: 'nav.rawMaterials' },
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

const adminGroups = [
  {
    key: 'nav.admin.group',
    items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, key: 'nav.admin.dashboard' },
      { to: '/admin/tenants', icon: Building2, key: 'nav.admin.tenants' },
      { to: '/admin/plans', icon: CreditCard, key: 'nav.admin.plans' },
    ],
  },
];

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

  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-white tracking-tight">Echango Invoice</h1>
        {user && <p className="text-xs text-sidebar-foreground/60 mt-0.5 truncate">{user.email}</p>}
        {isSuperAdmin && (
          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-amber-400">
            <Shield className="h-3 w-3" /> Superadmin
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {isSuperAdmin ? (
          adminGroups.map((group) => (
            <div key={group.key} className="mt-3">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                {t(group.key)}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ to, icon: Icon, key }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {t(key)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))
        ) : (
          <>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors mb-1',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )
              }
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {t('nav.dashboard')}
            </NavLink>

            {groups.filter(g => g.key !== 'nav.group.production' || productionEnabled).map((group) => (
              <div key={group.key} className="mt-3">
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                  {t(group.key)}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(({ to, icon: Icon, key }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {t(key)}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </nav>

      <div className="px-2 py-3 border-t border-sidebar-border space-y-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {t('nav.settings')}
        </NavLink>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {t('auth.logout')}
        </button>
      </div>
    </aside>
  );
}
