// src/components/OrdersPage.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ORDERS_URL } from '../config/app';

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('atelimarket_user_token');
      
      if (!token) {
        setError('Please login to view orders');
        setLoading(false);
        return;
      }

      const response = await axios.get(ORDERS_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setOrders(response.data.orders);
      }
    } catch (err) {
      setError('Failed to fetch orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Pending': 'bg-slate-100 text-slate-700',
      'Confirmed': 'bg-yellow-100 text-yellow-700',
      'Shipped': 'bg-blue-100 text-blue-700',
      'Delivered': 'bg-green-100 text-green-700',
      'Cancelled': 'bg-red-100 text-red-700'
    };
    return styles[status] || 'bg-slate-100 text-slate-700';
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B3C5D]"></div>
        <p className="text-slate-400 mt-4">Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-red-500 font-bold">{error}</p>
        <Link to="/auth?mode=login" className="mt-4 inline-block bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#07263b] transition">
          Login to view orders
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <span>📦</span> My Orders
        </h1>
        <Link to="/" className="text-sm text-[#0B3C5D] font-bold hover:underline">
          ← Continue Shopping
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="text-6xl mb-4">🛍️</div>
          <h3 className="font-bold text-lg text-slate-700">No orders yet</h3>
          <p className="text-slate-400 text-sm mt-2">Start shopping to place your first order!</p>
          <Link to="/" className="mt-4 inline-block bg-[#FF5722] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#e64a19] transition">
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm font-bold text-slate-600">
                      #{order._id.slice(-8).toUpperCase()}
                    </span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${getStatusBadge(order.status)}`}>
                      {order.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="text-slate-600">
                      {order.items?.length} {order.items?.length === 1 ? 'item' : 'items'}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-[#0B3C5D]">₹{order.total}</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600 capitalize">
                      {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}
                    </span>
                  </div>
                </div>
                <Link 
                  to={`/orders/track/${order._id}`}
                  className="bg-[#0B3C5D] text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-[#07263b] transition text-center whitespace-nowrap"
                >
                  Track Order →
                </Link>
              </div>

              {/* Order items preview */}
              {order.items && order.items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  {order.items.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="bg-slate-50 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-slate-100">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-slate-400">×{item.qty}</span>
                    </div>
                  ))}
                  {order.items.length > 3 && (
                    <span className="text-xs text-slate-400 flex items-center px-2">
                      +{order.items.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
