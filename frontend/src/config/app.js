// API Configuration
const API_BASE = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const BACKEND_ORIGIN = import.meta.env.PROD ? '' : API_BASE.replace(/\/api$/, '');

export const API_URL = `${API_BASE}/products`;
export const AUTH_URL = `${API_BASE}/auth`;
export const IMAGE_URL = `${BACKEND_ORIGIN}/uploads`;
export const ORDERS_URL = `${API_BASE}/orders`;
