// =============================================
// API Service - Supabase Version
// =============================================

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'http://localhost:5000/api/auth';

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