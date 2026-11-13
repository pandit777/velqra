// API Configuration
const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://velqra-aeap.onrender.com/api'
    : 'http://localhost:5000/api')
).replace(/\/+$/, '');
const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, '');

export const API_URL = `${API_BASE}/products`;
export const AUTH_URL = (import.meta.env.VITE_AUTH_URL || `${API_BASE}/auth`).replace(/\/+$/, '');
export const IMAGE_URL = `${BACKEND_ORIGIN}/uploads`;
export const ORDERS_URL = `${API_BASE}/orders`;
