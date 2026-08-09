import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * Stockage des jetons, fourni par l'application hôte.
 *
 * Asynchrone à dessein : le web s'appuie sur localStorage (synchrone, trivialement
 * enveloppé), le mobile sur @capacitor/preferences adossé au Keychain / Keystore,
 * qui lui ne l'est pas. Une interface synchrone aurait exclu le mobile.
 */
export interface TokenStorage {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setTokens(accessToken: string, refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientConfig {
  /** Racine de l'API. Le web passe '/api/v1' (même origine) ; le mobile doit
   *  fournir une URL absolue — la webview Capacitor est sur capacitor://localhost. */
  baseURL: string;
  storage: TokenStorage;
  /** Appelé quand le refresh échoue : la session est définitivement perdue. */
  onSessionExpired: () => void;
}

/** Vraie panne réseau (à distinguer d'une erreur applicative 4xx/5xx). */
export function isNetworkError(error: unknown): boolean {
  const e = error as AxiosError;
  return Boolean(e?.isAxiosError) && !e.response;
}

export function createApiClient(config: ApiClientConfig): AxiosInstance {
  const { baseURL, storage, onSessionExpired } = config;

  const api = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
  });

  api.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
    const token = await storage.getAccessToken();
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });

  let isRefreshing = false;
  let queue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

  const drainQueue = (token?: string, error?: unknown) => {
    queue.forEach((p) => (token ? p.resolve(token) : p.reject(error)));
    queue = [];
  };

  api.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
      if (error.response?.status !== 401 || original?._retry) {
        return Promise.reject(error);
      }
      original._retry = true;

      // Un refresh est déjà en vol : on attend son issue plutôt que d'en lancer
      // un second, qui invaliderait le premier (rotation du refresh token).
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      isRefreshing = true;
      try {
        const rt = await storage.getRefreshToken();
        if (!rt) throw new Error('no_refresh_token');

        // Instance nue : passer par `api` relancerait l'intercepteur en boucle.
        const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: rt });
        const { accessToken, refreshToken } = data.data;

        await storage.setTokens(accessToken, refreshToken);
        drainQueue(accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch (refreshError) {
        drainQueue(undefined, refreshError);
        await storage.clear();
        onSessionExpired();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    },
  );

  return api;
}

/**
 * Traduit une erreur API en message affichable.
 *
 * Le backend renvoie `message` soit comme clé i18n (« errors.product_in_use »),
 * soit comme tableau class-validator (chaînes anglaises) — ce dernier cas
 * retombe toujours sur le message générique.
 */
export function resolveApiError(error: unknown, t: (key: string) => string): string {
  const data = (error as any)?.response?.data;
  if (!data) return t('errors.network');

  const raw = data.message;
  if (Array.isArray(raw)) return t('errors.generic');

  if (typeof raw === 'string') {
    const translated = t(raw);
    // i18next renvoie la clé elle-même quand la traduction est absente
    if (translated !== raw) return translated;
    const withPrefix = `errors.${raw}`;
    const translatedWithPrefix = t(withPrefix);
    if (translatedWithPrefix !== withPrefix) return translatedWithPrefix;
  }

  return t('errors.generic');
}
