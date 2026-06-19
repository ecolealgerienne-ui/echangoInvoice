import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Truck, Package, Layers,
  FileText, Receipt, BarChart2, Settings, LogOut, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/customers', icon: Users, key: 'nav.customers' },
  { to: '/suppliers', icon: Truck, key: 'nav.suppliers' },
  { to: '/raw-materials', icon: Package, key: 'nav.rawMaterials' },
  { to: '/stock', icon: Layers, key: 'nav.stock' },
  { to: '/deliveries', icon: ClipboardList, key: 'nav.deliveries' },
  { to: '/invoices', icon: FileText, key: 'nav.invoices' },
  { to: '/expenses', icon: Receipt, key: 'nav.expenses' },
  { to: '/reports', icon: BarChart2, key: 'nav.reports' },
  { to: '/settings', icon: Settings, key: 'nav.settings' },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-white tracking-tight">Echango Invoice</h1>
        {user && <p className="text-xs text-sidebar-foreground/60 mt-0.5 truncate">{user.email}</p>}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, key }) => (
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
      </nav>

      <div className="px-2 py-3 border-t border-sidebar-border">
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
