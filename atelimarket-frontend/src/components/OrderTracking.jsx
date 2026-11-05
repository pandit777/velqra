// src/components/OrderTracking.jsx
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ORDERS_URL } from '../config/app';

const OrderTracking = () => {
  const { orderId } = useParams();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOrderTracking();
  }, [orderId]);

  const fetchOrderTracking = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('atelimarket_user_token');
      
      const response = await axios.get(
        `${ORDERS_URL}/${orderId}/tracking`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTracking(response.data.tracking);
      } else {
        setError('Failed to fetch order details');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch order tracking');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Order Placed': 'bg-orange-100 text-orange-700',
      'Order Confirmed': 'bg-yellow-100 text-yellow-700',
      'Confirmed': 'bg-yellow-100 text-yellow-700',
      'Shipped': 'bg-blue-100 text-blue-700',
      'Delivered': 'bg-green-100 text-green-700',
      'Cancelled': 'bg-red-100 text-red-700'
    };
    return styles[status] || 'bg-slate-100 text-slate-700';
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B3C5D]"></div>
        <p className="text-slate-400 mt-4 font-medium">Loading order details...</p>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h3 className="text-red-500 font-bold text-lg">{error || 'Order not found'}</h3>
        <Link to="/orders" className="mt-4 inline-block bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#07263b] transition">
          ← Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0B3C5D] to-[#1a6496] text-white p-6 rounded-2xl shadow-lg mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <span>📦</span> Order Tracking
            </h2>
            <p className="text-sm opacity-80 mt-1 font-mono">
              Order ID: #{tracking.orderId?.slice(-8).toUpperCase()}
            </p>
            <p className="text-xs opacity-70 mt-1">
              Placed: {new Date(tracking.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
            <span className="text-xs font-bold uppercase tracking-wider">Status:</span>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${getStatusBadge(tracking.currentStatus)}`}>
              {tracking.currentStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
        <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
          <span>🚚</span> Delivery Timeline
        </h3>
        
        <div className="space-y-6 relative">
          {tracking.timeline?.map((step, index) => (
            <div key={index} className="flex gap-4 relative">
              {/* Line connector */}
              {index < tracking.timeline.length - 1 && (
                <div className={`absolute left-5 top-10 w-0.5 h-12 ${
                  step.completed ? 'bg-green-500' : 'bg-slate-200'
                }`} />
              )}
              
              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl border-2 ${
                step.completed 
                  ? 'bg-green-100 border-green-500' 
                  : 'bg-slate-100 border-slate-300'
              }`}>
                {step.icon}
              </div>
              
              {/* Content */}
              <div className="flex-1 pt-0.5">
                <div className={`font-bold text-sm ${
                  step.completed ? 'text-slate-800' : 'text-slate-400'
                }`}>
                  {step.status}
                </div>
                <div className={`text-xs ${
                  step.completed ? 'text-slate-600' : 'text-slate-400'
                }`}>
                  {step.description}
                </div>
                {step.timestamp && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    {new Date(step.timestamp).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Order Details */}
      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
        <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          <span>📋</span> Order Summary
        </h3>
        
        <div className="space-y-2">
          {tracking.items?.map((item, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <div className="flex items-center gap-3 flex-1">
                <img 
                  src={item.image || 'https://via.placeholder.com/40'} 
                  alt={item.name}
                  className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                  onError={(e) => e.target.src = 'https://via.placeholder.com/40'}
                />
                <span className="font-medium text-slate-700 flex-1">{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-400 text-xs">×{item.qty}</span>
                <span className="font-bold text-[#0B3C5D]">₹{item.price * item.qty}</span>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 pt-4 border-t-2 border-slate-200 flex justify-between items-center">
          <span className="font-bold text-slate-600">Total</span>
          <span className="text-xl font-black text-[#0B3C5D]">₹{tracking.total}</span>
        </div>
      </div>

      {/* Delivery Address */}
      {tracking.delivery && (
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
          <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
            <span>📬</span> Delivery Address
          </h4>
          <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 space-y-1">
            <p className="font-bold text-slate-700">{tracking.delivery.fullName}</p>
            <p>{tracking.delivery.address}</p>
            <p>{tracking.delivery.city}, {tracking.delivery.state} - {tracking.delivery.pincode}</p>
            <p className="text-xs text-slate-400">📞 {tracking.delivery.phone}</p>
            {tracking.delivery.note && (
              <p className="text-xs text-slate-400 mt-1">📝 Note: {tracking.delivery.note}</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-4 justify-center">
        <Link to="/orders" className="bg-slate-100 text-slate-700 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200 transition">
          ← Back to Orders
        </Link>
        {tracking.currentStatus !== 'Delivered' && tracking.currentStatus !== 'Cancelled' && (
          <button 
            onClick={fetchOrderTracking}
            className="bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#07263b] transition flex items-center gap-2"
          >
            <span>🔄</span> Refresh Status
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
