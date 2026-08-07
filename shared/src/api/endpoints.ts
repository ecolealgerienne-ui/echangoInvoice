import type { AxiosInstance } from 'axios';
import type { TokenStorage } from './client';

type Params = Record<string, unknown>;

/**
 * Fabrique les objets d'accès à l'API à partir d'une instance axios.
 *
 * Fabrique plutôt que singleton : web et mobile n'ont ni la même baseURL ni le
 * même stockage de jetons, mais partagent la totalité des routes.
 */
export function createEndpoints(api: AxiosInstance, storage: TokenStorage) {
  const authApi = {
    login: (email: string, password: string) =>
      api.post('/auth/login', { email, password }).then((r) => r.data.data),
    register: (companyName: string, email: string, password: string) =>
      api.post('/auth/register', { companyName, email, password }).then((r) => r.data.data),
    logout: async () => {
      const refreshToken = await storage.getRefreshToken();
      return api.post('/auth/logout', { refreshToken }).then((r) => r.data);
    },
    me: () => api.get('/auth/me').then((r) => r.data.data),
  };

  const customersApi = {
    list: (params?: Params) => api.get('/customers', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/customers/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/customers', body).then((r) => r.data),
    update: (id: string, body: unknown) => api.put(`/customers/${id}`, body).then((r) => r.data),
    remove: (id: string) => api.delete(`/customers/${id}`).then((r) => r.data),
    listContacts: (customerId: string) =>
      api.get(`/customers/${customerId}/contacts`).then((r) => r.data),
    createContact: (customerId: string, body: unknown) =>
      api.post(`/customers/${customerId}/contacts`, body).then((r) => r.data),
    updateContact: (customerId: string, contactId: string, body: unknown) =>
      api.put(`/customers/${customerId}/contacts/${contactId}`, body).then((r) => r.data),
    removeContact: (customerId: string, contactId: string) =>
      api.delete(`/customers/${customerId}/contacts/${contactId}`).then((r) => r.data),
  };

  const suppliersApi = {
    list: (params?: Params) => api.get('/suppliers', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/suppliers/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/suppliers', body).then((r) => r.data),
    update: (id: string, body: unknown) => api.put(`/suppliers/${id}`, body).then((r) => r.data),
    remove: (id: string) => api.delete(`/suppliers/${id}`).then((r) => r.data),
    listContacts: (id: string) => api.get(`/suppliers/${id}/contacts`).then((r) => r.data),
    createContact: (id: string, body: unknown) =>
      api.post(`/suppliers/${id}/contacts`, body).then((r) => r.data),
    updateContact: (id: string, contactId: string, body: unknown) =>
      api.put(`/suppliers/${id}/contacts/${contactId}`, body).then((r) => r.data),
    removeContact: (id: string, contactId: string) =>
      api.delete(`/suppliers/${id}/contacts/${contactId}`).then((r) => r.data),
  };

  const rawMaterialsApi = {
    list: (params?: Params) =>
      api.get('/products', { params: { ...params, type: 'material' } }).then((r) => r.data),
    get: (id: string) => api.get(`/products/${id}`).then((r) => r.data),
    create: (body: unknown) =>
      api.post('/products', { ...(body as object), type: 'material' }).then((r) => r.data),
    update: (id: string, body: unknown) => api.put(`/products/${id}`, body).then((r) => r.data),
    remove: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
  };

  const stockApi = {
    inventory: (params?: Params) => api.get('/stock/inventory', { params }).then((r) => r.data),
    alerts: () => api.get('/stock/alerts').then((r) => r.data),
    adjust: (body: unknown) => api.post('/stock/adjust', body).then((r) => r.data),
    setThreshold: (rawMaterialId: string, alertThreshold: number) =>
      api
        .patch(`/stock/inventory/${rawMaterialId}/threshold`, { alertThreshold })
        .then((r) => r.data),
  };

  const invoicesApi = {
    list: (params?: Params) => api.get('/invoices/sales-invoices', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/invoices/sales-invoices/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/invoices/sales-invoices', body).then((r) => r.data),
    update: (id: string, body: unknown) =>
      api.put(`/invoices/sales-invoices/${id}`, body).then((r) => r.data),
    updateStatus: (id: string, body: unknown) =>
      api.patch(`/invoices/sales-invoices/${id}/status`, body).then((r) => r.data),
    send: (id: string) =>
      api.patch(`/invoices/sales-invoices/${id}/status`, { status: 'sent' }).then((r) => r.data),
    cancel: (id: string) =>
      api.patch(`/invoices/sales-invoices/${id}/status`, { status: 'cancelled' }).then((r) => r.data),
    reopen: (id: string) =>
      api.patch(`/invoices/sales-invoices/${id}/status`, { status: 'draft' }).then((r) => r.data),
    remove: (id: string) => api.delete(`/invoices/sales-invoices/${id}`).then((r) => r.data),
    payments: (invoiceId: string) =>
      api.get('/invoices/payments', { params: { invoiceId } }).then((r) => r.data),
    addPayment: (body: unknown) => api.post('/invoices/payments', body).then((r) => r.data),
    pdf: (id: string) =>
      api.get(`/invoices/sales-invoices/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  };

  const productsApi = {
    list: (params?: Params) => api.get('/products', { params }).then((r) => r.data),
    create: (body: unknown) => api.post('/products', body).then((r) => r.data),
    update: (id: string, body: unknown) => api.put(`/products/${id}`, body).then((r) => r.data),
    remove: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
  };

  const deliveriesApi = {
    list: (params?: Params) =>
      api.get('/deliveries/delivery-notes', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/deliveries/delivery-notes/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/deliveries/delivery-notes', body).then((r) => r.data),
    update: (id: string, body: unknown) =>
      api.put(`/deliveries/delivery-notes/${id}`, body).then((r) => r.data),
    updateStatus: (id: string, body: unknown) =>
      api.patch(`/deliveries/delivery-notes/${id}/status`, body).then((r) => r.data),
    cancel: (id: string) =>
      api.patch(`/deliveries/delivery-notes/${id}/cancel`).then((r) => r.data),
    remove: (id: string) => api.delete(`/deliveries/delivery-notes/${id}`).then((r) => r.data),
    pdf: (id: string) =>
      api.get(`/deliveries/delivery-notes/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
    createInvoice: (id: string) =>
      api.post(`/deliveries/delivery-notes/${id}/create-invoice`).then((r) => r.data),
  };

  const expensesApi = {
    list: (params?: Params) => api.get('/expenses', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/expenses/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/expenses', body).then((r) => r.data),
    update: (id: string, body: unknown) => api.put(`/expenses/${id}`, body).then((r) => r.data),
    approve: (id: string) => api.patch(`/expenses/${id}/approve`).then((r) => r.data),
    remove: (id: string) => api.delete(`/expenses/${id}`).then((r) => r.data),
    summary: (month: string) =>
      api.get('/expenses/summary', { params: { month } }).then((r) => r.data),
  };

  const dashboardApi = {
    stats: (month: string) => api.get('/dashboard/stats', { params: { month } }).then((r) => r.data),
    salesChart: (month: string) =>
      api.get('/dashboard/charts/sales', { params: { month } }).then((r) => r.data),
    stockChart: () => api.get('/dashboard/charts/stock').then((r) => r.data),
  };

  const reportsApi = {
    sales: (params: Params) => api.get('/reports/sales', { params }).then((r) => r.data),
    purchases: (params: Params) => api.get('/reports/purchases', { params }).then((r) => r.data),
    expenses: (params: Params) => api.get('/reports/expenses', { params }).then((r) => r.data),
    stock: () => api.get('/reports/stock').then((r) => r.data),
    taxSummary: (params: Params) => api.get('/reports/tax-summary', { params }).then((r) => r.data),
  };

  const settingsApi = {
    get: () => api.get('/settings').then((r) => r.data),
    update: (body: unknown) => api.put('/settings', body).then((r) => r.data),
  };

  const quotesApi = {
    list: (params?: Params) => api.get('/quotes', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/quotes/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/quotes', body).then((r) => r.data),
    update: (id: string, body: unknown) => api.put(`/quotes/${id}`, body).then((r) => r.data),
    updateStatus: (id: string, body: unknown) =>
      api.patch(`/quotes/${id}/status`, body).then((r) => r.data),
    convert: (id: string) => api.post(`/quotes/${id}/convert`).then((r) => r.data),
    createBl: (id: string) => api.post(`/quotes/${id}/create-bl`).then((r) => r.data),
    remove: (id: string) => api.delete(`/quotes/${id}`).then((r) => r.data),
    pdf: (id: string) => api.get(`/quotes/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),
  };

  const purchasesApi = {
    listOrders: (params?: Params) =>
      api.get('/purchases/purchase-orders', { params }).then((r) => r.data),
    getOrder: (id: string) => api.get(`/purchases/purchase-orders/${id}`).then((r) => r.data),
    createOrder: (body: unknown) => api.post('/purchases/purchase-orders', body).then((r) => r.data),
    updateOrder: (id: string, body: unknown) =>
      api.patch(`/purchases/purchase-orders/${id}`, body).then((r) => r.data),
    updateOrderStatus: (id: string, body: unknown) =>
      api.patch(`/purchases/purchase-orders/${id}/status`, body).then((r) => r.data),
    removeOrder: (id: string) => api.delete(`/purchases/purchase-orders/${id}`).then((r) => r.data),
    listReceptions: (params?: Params) =>
      api.get('/purchases/reception-bls', { params }).then((r) => r.data),
    getReception: (id: string) => api.get(`/purchases/reception-bls/${id}`).then((r) => r.data),
    createReception: (body: unknown) =>
      api.post('/purchases/reception-bls', body).then((r) => r.data),
    listBills: (params?: Params) =>
      api.get('/purchases/vendor-bills', { params }).then((r) => r.data),
    getBill: (id: string) => api.get(`/purchases/vendor-bills/${id}`).then((r) => r.data),
    createBill: (body: unknown) => api.post('/purchases/vendor-bills', body).then((r) => r.data),
    updateBill: (id: string, body: unknown) =>
      api.put(`/purchases/vendor-bills/${id}`, body).then((r) => r.data),
    updateBillStatus: (id: string, status: string) =>
      api.patch(`/purchases/vendor-bills/${id}/status`, { status }).then((r) => r.data),
    removeBill: (id: string) => api.delete(`/purchases/vendor-bills/${id}`).then((r) => r.data),
    addBillPayment: (id: string, body: unknown) =>
      api.post(`/purchases/vendor-bills/${id}/payments`, body).then((r) => r.data),
  };

  const productionApi = {
    listNomenclatures: (params?: Params) =>
      api.get('/production/nomenclatures', { params }).then((r) => r.data),
    getNomenclature: (id: string) =>
      api.get(`/production/nomenclatures/${id}`).then((r) => r.data),
    createNomenclature: (body: unknown) =>
      api.post('/production/nomenclatures', body).then((r) => r.data),
    updateNomenclature: (id: string, body: unknown) =>
      api.patch(`/production/nomenclatures/${id}`, body).then((r) => r.data),
    deleteNomenclature: (id: string) =>
      api.delete(`/production/nomenclatures/${id}`).then((r) => r.data),
    listOrders: (params?: Params) => api.get('/production/orders', { params }).then((r) => r.data),
    getOrder: (id: string) => api.get(`/production/orders/${id}`).then((r) => r.data),
    createOrder: (body: unknown) => api.post('/production/orders', body).then((r) => r.data),
    startOrder: (id: string) => api.patch(`/production/orders/${id}/start`).then((r) => r.data),
    completeOrder: (id: string, body: unknown) =>
      api.patch(`/production/orders/${id}/complete`, body).then((r) => r.data),
    cancelOrder: (id: string, body?: unknown) =>
      api.patch(`/production/orders/${id}/cancel`, body).then((r) => r.data),
    listMovements: (orderId: string, params?: Params) =>
      api.get(`/production/orders/${orderId}/movements`, { params }).then((r) => r.data),
    createMovement: (orderId: string, body: unknown) =>
      api.post(`/production/orders/${orderId}/movements`, body).then((r) => r.data),
    createMovementBatch: (orderId: string, items: unknown[]) =>
      api.post(`/production/orders/${orderId}/movements/batch`, { items }).then((r) => r.data),
    getDashboard: () => api.get('/production/dashboard').then((r) => r.data),
  };

  const adminApi = {
    login: (email: string, password: string) =>
      api.post('/admin/auth/login', { email, password }).then((r) => r.data.data),
    refresh: (refreshToken: string) =>
      api.post('/admin/auth/refresh', { refreshToken }).then((r) => r.data.data),
    getStats: () => api.get('/admin/stats').then((r) => r.data),
    listTenants: (params?: Params) => api.get('/admin/tenants', { params }).then((r) => r.data),
    getTenantDetail: (id: string) => api.get(`/admin/tenants/${id}`).then((r) => r.data),
    patchTenantStatus: (id: string, status: string) =>
      api.patch(`/admin/tenants/${id}/status`, { status }).then((r) => r.data),
    deleteTenant: (id: string) => api.delete(`/admin/tenants/${id}`).then((r) => r.data),
    patchSubscription: (id: string, dto: Params) =>
      api.patch(`/admin/subscriptions/${id}`, dto).then((r) => r.data),
    listPlans: () => api.get('/admin/plans').then((r) => r.data),
    updatePlan: (id: string, dto: Params) => api.put(`/admin/plans/${id}`, dto).then((r) => r.data),
    listSaasPayments: (params?: Params) =>
      api.get('/admin/saas-payments', { params }).then((r) => r.data),
    createSaasPayment: (dto: Params) => api.post('/admin/saas-payments', dto).then((r) => r.data),
    getSaasPaymentSummary: () => api.get('/admin/saas-payments/summary').then((r) => r.data),
    listAuditLogs: (params?: Params) => api.get('/admin/audit-logs', { params }).then((r) => r.data),
  };

  const creditNotesApi = {
    list: (params?: Params) => api.get('/invoices/credit-notes', { params }).then((r) => r.data),
    get: (id: string) => api.get(`/invoices/credit-notes/${id}`).then((r) => r.data),
    create: (body: unknown) => api.post('/invoices/credit-notes', body).then((r) => r.data),
    issue: (id: string) => api.patch(`/invoices/credit-notes/${id}/issue`).then((r) => r.data),
    cancel: (id: string) => api.patch(`/invoices/credit-notes/${id}/cancel`).then((r) => r.data),
    remove: (id: string) => api.delete(`/invoices/credit-notes/${id}`).then((r) => r.data),
  };

  return {
    authApi, customersApi, suppliersApi, rawMaterialsApi, stockApi, invoicesApi,
    productsApi, deliveriesApi, expensesApi, dashboardApi, reportsApi, settingsApi,
    quotesApi, purchasesApi, productionApi, adminApi, creditNotesApi,
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
