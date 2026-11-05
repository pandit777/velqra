// API Configuration
const getBaseURL = () => {
  // Production - Render backend URL
  if (import.meta.env.PROD) {
    return 'https://atelimarket-backend.onrender.com';
  }
  // Development
  return 'http://localhost:5000';
};

const API_BASE = getBaseURL();

export const API_URL = `${API_BASE}/api/products`;
export const AUTH_URL = `${API_BASE}/api/auth`;
export const IMAGE_URL = `${API_BASE}/uploads`;
export const ORDERS_URL = `${API_BASE}/api/orders`;

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('🔧 API Configuration:');
  console.log(`📡 API_BASE: ${API_BASE}`);
  console.log(`📦 API_URL: ${API_URL}`);
  console.log(`🔐 AUTH_URL: ${AUTH_URL}`);
}