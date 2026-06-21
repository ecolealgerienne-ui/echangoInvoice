import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { CustomersPage } from '@/pages/customers/CustomersPage';
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage';
import { RawMaterialsPage } from '@/pages/raw-materials/RawMaterialsPage';
import { StockPage } from '@/pages/stock/StockPage';
import { InvoicesPage } from '@/pages/invoices/InvoicesPage';
import { DeliveryNotesPage } from '@/pages/deliveries/DeliveryNotesPage';
import { ProductsPage } from '@/pages/products/ProductsPage';
import { ExpensesPage } from '@/pages/expenses/ExpensesPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { QuotesPage } from '@/pages/quotes/QuotesPage';
import { PurchasesPage } from '@/pages/purchases/PurchasesPage';
import { VendorBillsPage } from '@/pages/purchases/VendorBillsPage';
import { CreditNotesPage } from '@/pages/credit-notes/CreditNotesPage';
import { ProductionPage } from '@/pages/production/ProductionPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

export function AppRouter() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/customers" element={<PrivateRoute><CustomersPage /></PrivateRoute>} />
      <Route path="/suppliers" element={<PrivateRoute><SuppliersPage /></PrivateRoute>} />
      <Route path="/raw-materials" element={<PrivateRoute><RawMaterialsPage /></PrivateRoute>} />
      <Route path="/stock" element={<PrivateRoute><StockPage /></PrivateRoute>} />
      <Route path="/invoices" element={<PrivateRoute><InvoicesPage /></PrivateRoute>} />
      <Route path="/deliveries" element={<PrivateRoute><DeliveryNotesPage /></PrivateRoute>} />
      <Route path="/products" element={<PrivateRoute><ProductsPage /></PrivateRoute>} />
      <Route path="/expenses" element={<PrivateRoute><ExpensesPage /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/quotes" element={<PrivateRoute><QuotesPage /></PrivateRoute>} />
      <Route path="/purchases" element={<PrivateRoute><PurchasesPage /></PrivateRoute>} />
      <Route path="/purchases/vendor-bills" element={<PrivateRoute><VendorBillsPage /></PrivateRoute>} />
      <Route path="/credit-notes" element={<PrivateRoute><CreditNotesPage /></PrivateRoute>} />
      <Route path="/production" element={<PrivateRoute><ProductionPage /></PrivateRoute>} />
    </Routes>
  );
}
