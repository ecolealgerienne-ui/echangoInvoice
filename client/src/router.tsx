import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { LoginPage } from '@/pages/auth/LoginPage';
import { VerificationPage } from '@/pages/verification/VerificationPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { PriceListsPage } from '@/pages/price-lists/PriceListsPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { CustomersPage } from '@/pages/customers/CustomersPage';
import { CustomerDetailPage } from '@/pages/customers/CustomerDetailPage';
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage';
import { SupplierDetailPage } from '@/pages/suppliers/SupplierDetailPage';
import { StockPage } from '@/pages/stock/StockPage';
import { InvoicesPage } from '@/pages/invoices/InvoicesPage';
import { InvoiceDetailPage } from '@/pages/invoices/InvoiceDetailPage';
import { DeliveryNotesPage } from '@/pages/deliveries/DeliveryNotesPage';
import { DeliveryNoteDetailPage } from '@/pages/deliveries/DeliveryNoteDetailPage';
import { ProductsPage } from '@/pages/products/ProductsPage';
import { ProductDetailPage } from '@/pages/products/ProductDetailPage';
import { ExpensesPage } from '@/pages/expenses/ExpensesPage';
import { ExpenseDetailPage } from '@/pages/expenses/ExpenseDetailPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { QuotesPage } from '@/pages/quotes/QuotesPage';
import { QuoteDetailPage } from '@/pages/quotes/QuoteDetailPage';
import { PurchasesPage } from '@/pages/purchases/PurchasesPage';
import { PurchaseOrderDetailPage } from '@/pages/purchases/PurchaseOrderDetailPage';
import { ReceptionDetailPage } from '@/pages/purchases/ReceptionDetailPage';
import { VendorBillsPage } from '@/pages/purchases/VendorBillsPage';
import { VendorBillDetailPage } from '@/pages/purchases/VendorBillDetailPage';
import { CreditNotesPage } from '@/pages/credit-notes/CreditNotesPage';
import { ProductionPage } from '@/pages/production/ProductionPage';
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminTenantsPage } from '@/pages/admin/AdminTenantsPage';
import { AdminTenantDetailPage } from '@/pages/admin/AdminTenantDetailPage';
import { AdminPlansPage } from '@/pages/admin/AdminPlansPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isSuperAdmin } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <AppShell>{children}</AppShell>;
}

export function AppRouter() {
  const { user, loading, isSuperAdmin } = useAuth();
  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      {/* Vérification d'un document par QR : publique, et volontairement hors
          de l'AppShell — celui qui scanne n'a pas de compte et n'a rien à faire
          dans la navigation de l'application. Déclarée avant les routes
          privées pour ne pas être avalée par la redirection vers /login. */}
      <Route path="/v/:type/:id/:signature" element={<VerificationPage />} />

      <Route path="/login" element={user ? <Navigate to={isSuperAdmin ? '/admin/dashboard' : '/dashboard'} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage />} />
      {/* Publique et sans redirection : la personne invitée n'a pas encore de
          compte, et le lien doit rester utilisable même si un autre compte est
          déjà connecté sur le poste. */}
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/" element={<Navigate to={isSuperAdmin ? '/admin/dashboard' : '/dashboard'} replace />} />

      {/* Admin routes */}
      <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/admin/tenants" element={<AdminRoute><AdminTenantsPage /></AdminRoute>} />
      <Route path="/admin/tenants/:id" element={<AdminRoute><AdminTenantDetailPage /></AdminRoute>} />
      <Route path="/admin/plans" element={<AdminRoute><AdminPlansPage /></AdminRoute>} />

      {/* Tenant routes */}
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/customers" element={<PrivateRoute><CustomersPage /></PrivateRoute>} />
      <Route path="/customers/:id" element={<PrivateRoute><CustomerDetailPage /></PrivateRoute>} />
      <Route path="/suppliers" element={<PrivateRoute><SuppliersPage /></PrivateRoute>} />
      <Route path="/suppliers/:id" element={<PrivateRoute><SupplierDetailPage /></PrivateRoute>} />
      <Route path="/price-lists" element={<PrivateRoute><PriceListsPage /></PrivateRoute>} />
      <Route path="/stock" element={<PrivateRoute><StockPage /></PrivateRoute>} />
      <Route path="/invoices" element={<PrivateRoute><InvoicesPage /></PrivateRoute>} />
      {/* Les pages détail portent l'identifiant dans l'URL : un document se
          transmet par lien à un collègue, et le retour du navigateur ramène à
          la liste — deux choses qu'une modale ne sait pas faire. */}
      <Route path="/invoices/:id" element={<PrivateRoute><InvoiceDetailPage /></PrivateRoute>} />
      <Route path="/deliveries" element={<PrivateRoute><DeliveryNotesPage /></PrivateRoute>} />
      <Route path="/deliveries/:id" element={<PrivateRoute><DeliveryNoteDetailPage /></PrivateRoute>} />
      <Route path="/products" element={<PrivateRoute><ProductsPage /></PrivateRoute>} />
      <Route path="/products/:id" element={<PrivateRoute><ProductDetailPage /></PrivateRoute>} />
      <Route path="/expenses" element={<PrivateRoute><ExpensesPage /></PrivateRoute>} />
      <Route path="/expenses/:id" element={<PrivateRoute><ExpenseDetailPage /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/quotes" element={<PrivateRoute><QuotesPage /></PrivateRoute>} />
      <Route path="/quotes/:id" element={<PrivateRoute><QuoteDetailPage /></PrivateRoute>} />
      <Route path="/purchases" element={<PrivateRoute><PurchasesPage /></PrivateRoute>} />
      {/* « vendor-bills » est déclaré avant « orders/:id » et « receptions/:id »,
          mais aucun conflit n'est possible : les trois segments sont distincts.
          On évite justement /purchases/:id, qui aurait avalé la liste des
          factures fournisseurs. */}
      <Route path="/purchases/orders/:id" element={<PrivateRoute><PurchaseOrderDetailPage /></PrivateRoute>} />
      <Route path="/purchases/receptions/:id" element={<PrivateRoute><ReceptionDetailPage /></PrivateRoute>} />
      <Route path="/purchases/vendor-bills" element={<PrivateRoute><VendorBillsPage /></PrivateRoute>} />
      <Route path="/purchases/vendor-bills/:id" element={<PrivateRoute><VendorBillDetailPage /></PrivateRoute>} />
      <Route path="/credit-notes" element={<PrivateRoute><CreditNotesPage /></PrivateRoute>} />
      <Route path="/production" element={<PrivateRoute><ProductionPage /></PrivateRoute>} />
    </Routes>
  );
}
