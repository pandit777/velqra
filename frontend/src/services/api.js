// =============================================
// API Service - Supabase Version
// =============================================

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://velqra-aeap.onrender.com/api'
    : 'http://localhost:5000/api')
).replace(/\/+$/, '');
const AUTH_URL = (import.meta.env.VITE_AUTH_URL || `${API_URL}/auth`).replace(/\/+$/, '');

export async function downloadOrderInvoice(orderId) {
  const token = sessionStorage.getItem('velqra_user_token');
  if (!token) throw new Error('Please login to download the invoice');

  const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}/invoice`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || 'Could not download invoice');
  }

  const file = await response.blob();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `VELQRA-invoice-${String(orderId).slice(-8)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// API Client
export const api = {
  // Get all products
  async getProducts() {
    const response = await fetch(`${API_URL}/products`);
    return response.json();
  },

  // Get single product
  async getProduct(id) {
    const response = await fetch(`${API_URL}/products/${id}`);
    return response.json();
  },

  // Register user
  async register(userData) {
    const response = await fetch(`${AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    return response.json();
  },

  // Login user
  async login(credentials) {
    const response = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return response.json();
  },

  // Verify token
  async verify(token) {
    const response = await fetch(`${AUTH_URL}/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
  },

  // Add to cart
  async addToCart(productId, qty, token) {
    const response = await fetch(`${API_URL}/cart/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ productId, qty })
    });
    return response.json();
  },

  // Get cart
  async getCart(token) {
    const response = await fetch(`${API_URL}/cart`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
  },

  // Create order
  async createOrder(orderData, token) {
    const response = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(orderData)
    });
    return response.json();
  }
};