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
};

export const suppliersApi = {
  list: (params?: Record<string, unknown>) => api.get('/suppliers', { params }).then(r => r.data),
  get: (id: string) => api.get(`/suppliers/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/suppliers', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/suppliers/${id}`, body).then(r => r.data),
  remove: (id: string) => api.delete(`/suppliers/${id}`).then(r => r.data),
};

export const rawMaterialsApi = {
  list: (params?: Record<string, unknown>) => api.get('/raw-materials', { params }).then(r => r.data),
  get: (id: string) => api.get(`/raw-materials/${id}`).then(r => r.data),
  create: (body: unknown) => api.post('/raw-materials', body).then(r => r.data),
  update: (id: string, body: unknown) => api.put(`/raw-materials/${id}`, body).then(r => r.data),
  remove: (id: string) => api.delete(`/raw-materials/${id}`).then(r => r.data),
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
  send: (id: string) => api.patch(`/invoices/sales-invoices/${id}/send`).then(r => r.data),
  cancel: (id: string) => api.patch(`/invoices/sales-invoices/${id}/cancel`).then(r => r.data),
  remove: (id: string) => api.delete(`/invoices/sales-invoices/${id}`).then(r => r.data),
  payments: (invoiceId: string) => api.get(`/invoices/payments`, { params: { invoiceId } }).then(r => r.data),
  addPayment: (body: unknown) => api.post('/invoices/payments', body).then(r => r.data),
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
  cancel: (id: string) => api.patch(`/deliveries/delivery-notes/${id}/cancel`).then(r => r.data),
  remove: (id: string) => api.delete(`/deliveries/delivery-notes/${id}`).then(r => r.data),
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
};

export const settingsApi = {
  get: () => api.get('/settings').then(r => r.data),
  update: (body: unknown) => api.put('/settings', body).then(r => r.data),
};
