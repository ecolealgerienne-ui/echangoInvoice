import {
  createApiClient,
  createEndpoints,
  type TokenStorage,
} from '@echango/shared';

/**
 * Adaptateur web du client API partagé.
 *
 * Toute la logique (intercepteurs, rotation du refresh token, file d'attente)
 * vit dans @echango/shared ; on ne fournit ici que ce qui est propre au
 * navigateur : localStorage et la redirection vers /login.
 */
const storage: TokenStorage = {
  getAccessToken: async () => localStorage.getItem('accessToken'),
  getRefreshToken: async () => localStorage.getItem('refreshToken'),
  setTokens: async (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  },
  clear: async () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
};

const api = createApiClient({
  baseURL: '/api/v1',
  storage,
  onSessionExpired: () => {
    window.location.href = '/login';
  },
});

export const {
  authApi, customersApi, suppliersApi, rawMaterialsApi, stockApi, invoicesApi,
  productsApi, deliveriesApi, expensesApi, dashboardApi, reportsApi, settingsApi,
  quotesApi, purchasesApi, productionApi, adminApi, creditNotesApi, usersApi,
  priceListsApi,
} = createEndpoints(api, storage);

export { resolveApiError, isNetworkError } from '@echango/shared';

export default api;
