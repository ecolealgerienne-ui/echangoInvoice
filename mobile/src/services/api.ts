import { Preferences } from '@capacitor/preferences';
import { createApiClient, createEndpoints, type TokenStorage } from '@echango/shared';
import { API_URL } from '../config';
import { connectivity } from './connectivity';

/**
 * Adaptateur mobile du client API partagé.
 *
 * Les jetons vont dans @capacitor/preferences — adossé au Keychain iOS et au
 * Keystore Android — et jamais dans SQLite (spec 17 §2.1). D'où l'interface
 * asynchrone de TokenStorage.
 */
const storage: TokenStorage = {
  getAccessToken: async () => (await Preferences.get({ key: 'accessToken' })).value,
  getRefreshToken: async () => (await Preferences.get({ key: 'refreshToken' })).value,
  setTokens: async (accessToken, refreshToken) => {
    await Preferences.set({ key: 'accessToken', value: accessToken });
    await Preferences.set({ key: 'refreshToken', value: refreshToken });
  },
  clear: async () => {
    await Preferences.remove({ key: 'accessToken' });
    await Preferences.remove({ key: 'refreshToken' });
  },
};

let onSessionExpired: () => void = () => {};

/** Branché par l'app au montage : évite un import circulaire avec la navigation. */
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

export const api = createApiClient({
  baseURL: API_URL,
  storage,
  onSessionExpired: () => onSessionExpired(),
});

// Toute panne réseau bascule l'état de connectivité : l'UI le reflète sans
// attendre la prochaine sonde périodique.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.isAxiosError && !error.response) connectivity.markOffline();
    return Promise.reject(error);
  },
);

export const tokenStorage = storage;

export const {
  authApi, customersApi, suppliersApi, rawMaterialsApi, stockApi, invoicesApi,
  productsApi, deliveriesApi, expensesApi, dashboardApi, reportsApi, settingsApi,
  quotesApi, purchasesApi, productionApi, adminApi, creditNotesApi,
} = createEndpoints(api, storage);
