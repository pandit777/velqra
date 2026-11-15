const DEFAULT_PRODUCTION_API_BASE = 'https://velqra-aeap.onrender.com/api';
const configuredApiBase = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

export const API_BASE = import.meta.env.PROD
  ? (/^https:\/\//i.test(configuredApiBase)
      ? configuredApiBase
      : DEFAULT_PRODUCTION_API_BASE)
  : (configuredApiBase || '/api');
export const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, '');

export const API_URL = `${API_BASE}/products`;
export const AUTH_URL = `${API_BASE}/auth`;
export const IMAGE_URL = `${BACKEND_ORIGIN}/uploads`;
export const ORDERS_URL = `${API_BASE}/orders`;
