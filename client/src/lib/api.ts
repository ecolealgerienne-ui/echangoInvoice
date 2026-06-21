import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function drainQueue(token?: string, error?: unknown) {
  queue.forEach(p => (token ? p.resolve(token) : p.reject(error)));
  queue = [];
}

// Refresh token on 401
api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      isRefreshing = true;
      try {
        const rt = localStorage.getItem('refreshToken');
        if (!rt) throw new Error('no_refresh_token');
        const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken: rt });
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        drainQueue(data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        drainQueue(undefined, refreshError);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Resolve an API error to a translated string.
 *
 * The backend sends `message` as an i18n key (e.g. "errors.product_in_use")
 * or as a class-validator array (e.g. ["email must be an email"]).
 * We try t(key) first; if the key has no translation we fall back to
 * t('errors.generic').
 */
export function resolveApiError(
  error: unknown,
  t: (key: string) => string,
): string {
  const data = (error as any)?.response?.data;
  if (!data) return t('errors.network');

  const raw = data.message;
  // class-validator sends an array of English strings → always generic
  if (Array.isArray(raw)) return t('errors.generic');

  if (typeof raw === 'string') {
    // Try the key as-is first (e.g. "errors.product_in_use")
    const translated = t(raw);
    // i18next returns the key itself when no translation found
    if (translated !== raw) return translated;
    // Key without namespace prefix (e.g. "product_in_use" → "errors.product_in_use")
    const withPrefix = `errors.${raw}`;
    const translatedWithPrefix = t(withPrefix);
    if (translatedWithPrefix !== withPrefix) return translatedWithPrefix;
  }

  return t('errors.generic');
}

export default api;

// ── API helpers ─────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data.data),
};

export const customersApi = {
  list: (params?: Record<string, unknown>) => api.get('/customers', { params }).then(r => r.data),
  get: (id: string) => api.get(`/customers/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/customers', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/customers/${id}`, body).then(r => r.data),
  remove: (id: string) => api.delete(`/customers/${id}`).then(r => r.data),
  listContacts: (customerId: string) => api.get(`/customers/${customerId}/contacts`).then(r => r.data),
  createContact: (customerId: string, body: unknown) => api.post(`/customers/${customerId}/contacts`, body).then(r => r.data),
  updateContact: (customerId: string, contactId: string, body: unknown) => api.put(`/customers/${customerId}/contacts/${contactId}`, body).then(r => r.data),
  removeContact: (customerId: string, contactId: string) => api.delete(`/customers/${customerId}/contacts/${contactId}`).then(r => r.data),
};

export const suppliersApi = {
  list: (params?: Record<string, unknown>) => api.get('/suppliers', { params }).then(r => r.data),
  get: (id: string) => api.get(`/suppliers/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/suppliers', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/suppliers/${id}`, body).then(r => r.data),
  remove: (id: string) => api.delete(`/suppliers/${id}`).then(r => r.data),
  listContacts: (id: string) => api.get(`/suppliers/${id}/contacts`).then(r => r.data),
  createContact: (id: string, body: unknown) => api.post(`/suppliers/${id}/contacts`, body).then(r => r.data),
  updateContact: (id: string, contactId: string, body: unknown) => api.put(`/suppliers/${id}/contacts/${contactId}`, body).then(r => r.data),
  removeContact: (id: string, contactId: string) => api.delete(`/suppliers/${id}/contacts/${contactId}`).then(r => r.data),
};

export const rawMaterialsApi = {
  list: (params?: Record<string, unknown>) => api.get('/products', { params: { ...params, type: 'material' } }).then(r => r.data),
  get: (id: string) => api.get(`/products/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/products', { ...body as object, type: 'material' }).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/products/${id}`, body).then(r => r.data),
  remove: (id: string) => api.delete(`/products/${id}`).then(r => r.data),
};

export const stockApi = {
  inventory: (params?: Record<string, unknown>) => api.get('/stock/inventory', { params }).then(r => r.data),
  alerts: () => api.get('/stock/alerts').then(r => r.data),
  adjust: (body: unknown) => api.post('/stock/adjust', body).then(r => r.data),
  setThreshold: (rawMaterialId: string, alertThreshold: number) =>
    api.patch(`/stock/inventory/${rawMaterialId}/threshold`, { alertThreshold }).then(r => r.data),
};

export const invoicesApi = {
  list: (params?: Record<string, unknown>) => api.get('/invoices/sales-invoices', { params }).then(r => r.data),
  get: (id: string) => api.get(`/invoices/sales-invoices/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/invoices/sales-invoices', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/invoices/sales-invoices/${id}`, body).then(r => r.data),
  updateStatus: (id: string, body: unknown) => api.patch(`/invoices/sales-invoices/${id}/status`, body).then(r => r.data),
  send: (id: string) => api.patch(`/invoices/sales-invoices/${id}/status`, { status: 'sent' }).then(r => r.data),
  cancel: (id: string) => api.patch(`/invoices/sales-invoices/${id}/status`, { status: 'cancelled' }).then(r => r.data),
  remove: (id: string) => api.delete(`/invoices/sales-invoices/${id}`).then(r => r.data),
  payments: (invoiceId: string) => api.get(`/invoices/payments`, { params: { invoiceId } }).then(r => r.data),
  addPayment: (body: unknown) => api.post('/invoices/payments', body).then(r => r.data),
  pdf: (id: string) => api.get(`/invoices/sales-invoices/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),
};

export const productsApi = {
  list: (params?: Record<string, unknown>) => api.get('/products', { params }).then(r => r.data),
  create: (body: unknown) => api.post('/products', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/products/${id}`, body).then(r => r.data),
  remove: (id: string) => api.delete(`/products/${id}`).then(r => r.data),
};

export const deliveriesApi = {
  list: (params?: Record<string, unknown>) => api.get('/deliveries/delivery-notes', { params }).then(r => r.data),
  get: (id: string) => api.get(`/deliveries/delivery-notes/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/deliveries/delivery-notes', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/deliveries/delivery-notes/${id}`, body).then(r => r.data),
  updateStatus: (id: string, body: unknown) => api.patch(`/deliveries/delivery-notes/${id}/status`, body).then(r => r.data),
  cancel: (id: string) => api.patch(`/deliveries/delivery-notes/${id}/cancel`).then(r => r.data),
  remove: (id: string) => api.delete(`/deliveries/delivery-notes/${id}`).then(r => r.data),
  pdf: (id: string) => api.get(`/deliveries/delivery-notes/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),
  createInvoice: (id: string) => api.post(`/deliveries/delivery-notes/${id}/create-invoice`).then(r => r.data),
};

export const expensesApi = {
  list: (params?: Record<string, unknown>) => api.get('/expenses', { params }).then(r => r.data),
  get: (id: string) => api.get(`/expenses/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/expenses', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/expenses/${id}`, body).then(r => r.data),
  approve: (id: string) => api.patch(`/expenses/${id}/approve`).then(r => r.data),
  remove: (id: string) => api.delete(`/expenses/${id}`).then(r => r.data),
  summary: (month: string) => api.get('/expenses/summary', { params: { month } }).then(r => r.data),
};

export const dashboardApi = {
  stats: (month: string) => api.get('/dashboard/stats', { params: { month } }).then(r => r.data),
  salesChart: (month: string) => api.get('/dashboard/charts/sales', { params: { month } }).then(r => r.data),
  stockChart: () => api.get('/dashboard/charts/stock').then(r => r.data),
};

export const reportsApi = {
  sales: (params: Record<string, unknown>) => api.get('/reports/sales', { params }).then(r => r.data),
  purchases: (params: Record<string, unknown>) => api.get('/reports/purchases', { params }).then(r => r.data),
  expenses: (params: Record<string, unknown>) => api.get('/reports/expenses', { params }).then(r => r.data),
  stock: () => api.get('/reports/stock').then(r => r.data),
  taxSummary: (params: Record<string, unknown>) => api.get('/reports/tax-summary', { params }).then(r => r.data),
};

export const settingsApi = {
  get: () => api.get('/settings').then(r => r.data),
  update: (body: unknown) => api.put('/settings', body).then(r => r.data),
};

export const quotesApi = {
  list: (params?: Record<string, unknown>) => api.get('/quotes', { params }).then(r => r.data),
  get: (id: string) => api.get(`/quotes/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/quotes', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/quotes/${id}`, body).then(r => r.data),
  updateStatus: (id: string, body: unknown) => api.patch(`/quotes/${id}/status`, body).then(r => r.data),
  convert: (id: string) => api.post(`/quotes/${id}/convert`).then(r => r.data),
  createBl: (id: string) => api.post(`/quotes/${id}/create-bl`).then(r => r.data),
  remove: (id: string) => api.delete(`/quotes/${id}`).then(r => r.data),
  pdf: (id: string) => api.get(`/quotes/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),
};

export const purchasesApi = {
  listOrders: (params?: Record<string, unknown>) => api.get('/purchases/purchase-orders', { params }).then(r => r.data),
  getOrder: (id: string) => api.get(`/purchases/purchase-orders/${id}`).then(r => r.data),
  createOrder: (body: unknown) => api.post('/purchases/purchase-orders', body).then(r => r.data),
  updateOrder: (id: string, body: unknown) => api.patch(`/purchases/purchase-orders/${id}`, body).then(r => r.data),
  updateOrderStatus: (id: string, body: unknown) => api.patch(`/purchases/purchase-orders/${id}/status`, body).then(r => r.data),
  removeOrder: (id: string) => api.delete(`/purchases/purchase-orders/${id}`).then(r => r.data),
  listReceptions: (params?: Record<string, unknown>) => api.get('/purchases/reception-bls', { params }).then(r => r.data),
  getReception: (id: string) => api.get(`/purchases/reception-bls/${id}`).then(r => r.data),
  createReception: (body: unknown) => api.post('/purchases/reception-bls', body).then(r => r.data),
  listBills: (params?: Record<string, unknown>) => api.get('/purchases/vendor-bills', { params }).then(r => r.data),
  getBill: (id: string) => api.get(`/purchases/vendor-bills/${id}`).then(r => r.data),
  createBill: (body: unknown) => api.post('/purchases/vendor-bills', body).then(r => r.data),
  updateBill: (id: string, body: unknown) => api.put(`/purchases/vendor-bills/${id}`, body).then(r => r.data),
  updateBillStatus: (id: string, status: string) => api.patch(`/purchases/vendor-bills/${id}/status`, { status }).then(r => r.data),
  removeBill: (id: string) => api.delete(`/purchases/vendor-bills/${id}`).then(r => r.data),
  addBillPayment: (id: string, body: unknown) => api.post(`/purchases/vendor-bills/${id}/payments`, body).then(r => r.data),
};

export const creditNotesApi = {
  list: (params?: Record<string, unknown>) => api.get('/invoices/credit-notes', { params }).then(r => r.data),
  get: (id: string) => api.get(`/invoices/credit-notes/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/invoices/credit-notes', body).then(r => r.data),
  issue: (id: string) => api.patch(`/invoices/credit-notes/${id}/issue`).then(r => r.data),
  cancel: (id: string) => api.patch(`/invoices/credit-notes/${id}/cancel`).then(r => r.data),
  remove: (id: string) => api.delete(`/invoices/credit-notes/${id}`).then(r => r.data),
};
