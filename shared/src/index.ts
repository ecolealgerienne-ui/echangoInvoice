export {
  createApiClient,
  isNetworkError,
  resolveApiError,
  type ApiClientConfig,
  type TokenStorage,
} from './api/client';

export { createEndpoints, type Endpoints } from './api/endpoints';

export { cn, formatDate, formatCurrency, formatNumber, currentMonth } from './utils';

export { rules, validate } from './validation';

export {
  createI18n, fr, ar, LANGUES, SENS,
  langueInitiale, memoriserLangue, type Langue,
} from './i18n';
