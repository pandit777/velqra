import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, Link, useLocation, useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import { downloadOrderInvoice } from './services/api';
import { captureTrafficAttribution, getTrafficAttribution } from './lib/trafficAttribution';
import {
  CURRENCY_OPTIONS,
  LANGUAGE_OPTIONS,
  LocalizationContext,
  formatCurrency as formatMoney,
  translate,
  useLocalization
} from './i18n/localization';
import LocaleControls from './i18n/LocaleControls';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import banner1 from './assets/banner1.png';
import banner2 from './assets/banner2.png';
import banner3 from './assets/banner3.png';
import velqraLogo from './assets/velqra-logo.png';

// =============================================
// API URLs - SECURE (Environment Variables)
// =============================================
const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://atelimarket-backend.onrender.com/api'
    : 'http://localhost:5000/api')
).replace(/\/$/, '');
const AUTH_URL = import.meta.env.VITE_AUTH_URL || `${API_URL}/auth`;
const PRODUCTS_CACHE_KEY = 'velqra_products_cache';
const EXCHANGE_RATES_CACHE_KEY = 'velqra_exchange_rates';
const ADMIN_SETUP_CACHE_KEY = 'velqra_admin_setup_complete';
const EXCHANGE_RATE_API_URL = 'https://api.frankfurter.dev/v2/rates';
const isValidGmailAddress = (value) => {
  const normalizedEmail = String(value || '').trim().toLowerCase();
  const [localPart, domain, ...extraParts] = normalizedEmail.split('@');
  if (!localPart || domain !== 'gmail.com' || extraParts.length > 0 ||
      localPart.length > 64 || normalizedEmail.length > 254) return false;

  const [username, alias, ...extraAliases] = localPart.split('+');
  const isValidPart = (part, maxLength) => Boolean(part) &&
    part.length <= maxLength &&
    /^[a-z0-9.]+$/.test(part) &&
    !part.startsWith('.') &&
    !part.endsWith('.') &&
    !part.includes('..');

  return extraAliases.length === 0 &&
    isValidPart(username, 30) &&
    (alias === undefined || isValidPart(alias, 64));
};
const getCachedExchangeRates = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(EXCHANGE_RATES_CACHE_KEY) || '{}');
    const rates = cached.rates && typeof cached.rates === 'object' ? cached.rates : {};
    return {
      rates: { INR: 1, ...rates },
      date: typeof cached.date === 'string' ? cached.date : ''
    };
  } catch {
    return { rates: { INR: 1 }, date: '' };
  }
};
const getPayUPaymentUrl = (value) => {
  const paymentUrl = new URL(String(value));
  if (paymentUrl.protocol !== 'https:' ||
      !['secure.payu.in', 'test.payu.in'].includes(paymentUrl.hostname)) {
    throw new Error('Invalid payment gateway URL');
  }
  return paymentUrl.href;
};

const getCachedProducts = () => {
  try {
    const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
    const products = cached ? JSON.parse(cached) : [];
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
};

const getSessionUser = () => {
  try {
    const saved = sessionStorage.getItem('velqra_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    sessionStorage.removeItem('velqra_user');
    return null;
  }
};

const getRegisteredPhone = (user) =>
  String(user?.phone || user?.phoneNumber || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);

const normalizeCart = (items = []) => items.map(item => ({
  ...item,
  _id: item._id || item.productId || item.product_id,
  originalPrice: item.originalPrice ?? item.original_price ?? 0,
  image: item.image || item.imageUrl || item.image_url || '',
  selectedAttributes: item.selectedAttributes || item.selected_attributes || {},
  promoCode: item.promoCode || item.promo_code || '',
  promoApplied: item.promoApplied ?? item.promo_applied ?? Boolean(item.promoCode || item.promo_code)
}));

const getCartItemKey = (item) => JSON.stringify([
  String(item._id || item.productId || item.product_id || item.id || ''),
  Object.fromEntries(
    Object.entries(item.selectedAttributes || item.selected_attributes || {}).sort(([a], [b]) => a.localeCompare(b))
  ),
  String(item.promoApplied || item.promo_applied ? item.promoCode || item.promo_code || '' : '').trim().toUpperCase()
]);

const normalizeProduct = (product) => ({
  ...product,
  _id: product._id || product.id,
  originalPrice: Number(product.originalPrice ?? product.original_price ?? product.price ?? 0),
  discountPercent: Number(product.discountPercent ?? product.discount_percent ?? 0),
  price: Number(
    product.price ??
    Number(product.original_price ?? product.originalPrice ?? 0) *
      (1 - Number(product.discountPercent ?? product.discount_percent ?? 0) / 100)
  ),
  promoCode: product.promoCode || product.promo_code || '',
  promoDiscount: Number(product.promoDiscount ?? product.promo_discount ?? 0)
});

// =============================================
// Helper Functions
// =============================================
const getProductDisplayImage = (product) => {
  if (!product) return '';
  
  const imagePaths = [];
  if (Array.isArray(product.images) && product.images.length > 0) {
    imagePaths.push(...product.images);
  }
  if (product.image) imagePaths.push(product.image);
  if (product.imageUrl) imagePaths.push(product.imageUrl);
  if (product.img) imagePaths.push(product.img);
  
  const validPaths = imagePaths.filter(Boolean);
  
  if (validPaths.length > 0) {
    return validPaths[0];
  }
  
  const category = (product.category || 'Product').toString();
  const label = (product.name || 'Product').toString();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <rect width="400" height="300" rx="24" fill="#0B3C5D"/>
      <rect x="24" y="24" width="352" height="252" rx="18" fill="rgba(255,255,255,0.12)"/>
      <circle cx="300" cy="90" r="48" fill="#FF5722"/>
      <text x="200" y="160" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="700">${label}</text>
      <text x="200" y="205" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-family="Arial, sans-serif" font-size="16">${category}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

// ✅ YouTube ID Extractor
const getYouTubeId = (url) => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^#&?]*)/,
    /youtube\.com\/shorts\/([^#&?]*)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  }
  return null;
};

const getVimeoId = (url) => {
  if (!url) return null;
  const regExp = /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/;
  const match = url.match(regExp);
  return match ? match[1] : null;
};


// ═══════════════════════════════════════════════════
// 🧪 TEST MODE BANNER
// ═══════════════════════════════════════════════════
const TestModeBanner = ({ otp }) => (
  <div className="bg-amber-50 border-2 border-dashed border-amber-400 rounded-xl px-4 py-3 mb-4">
    <div className="flex items-start gap-2">
      <span className="text-lg flex-shrink-0">🧪</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">Test Mode Active</p>
        <p className="text-[11px] text-amber-600 mt-0.5 leading-tight">SMS is disabled for this number. OTP auto-filled for testing.</p>
        {otp && (
          <p className="mt-2 text-sm font-black text-amber-800 tracking-widest">
            OTP: <span className="bg-amber-200 px-2 py-0.5 rounded">{otp}</span>
          </p>
        )}
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════
// 🆕 RETURN REQUEST MODAL (COD — OTP + Bank + Form)
// ═══════════════════════════════════════════════════
const RETURN_REASONS = [
  'Damaged product',
  'Wrong item received',
  'Product not as described',
  'Quality issue',
  'Size/fit issue',
  'Changed my mind',
  'Other'
];

const ReturnRequestModal = ({ isOpen, onClose, order, onSuccess }) => {
  const { formatCurrency } = useLocalization();
  const [step, setStep] = useState('otp'); // otp → otp-verify → bank → form → done
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [returnToken, setReturnToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [resendDisabled, setResendDisabled] = useState(false);

  // Bank
  const [bank, setBank] = useState({
    accountHolderName: '', accountNumber: '', ifscCode: '', bankName: '', upiId: ''
  });
  const [bankError, setBankError] = useState('');

  // Return form
  const [selectedItems, setSelectedItems] = useState({});
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const token = sessionStorage.getItem('velqra_user_token');

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    } else {
      setResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
  if (isOpen) {
    setStep('otp');
    setOtp('');
    setDevOtp('');
    setReturnToken('');
    setError('');
    setSelectedItems({});
    setReason('');
    setDescription('');
    setSubmitError('');
    setBankError('');
    setTimer(0);
    // ❌ Auto-send hata diya — user khud "Send OTP" dabayega
  }
}, [isOpen]);

  const startTimer = () => {
    setTimer(60);
    setResendDisabled(true);
  };

  if (!isOpen || !order) return null;

  // ========== STEP 1: Send OTP ==========
  const sendOtp = async () => {
    setLoading(true);
    setError('');
    setDevOtp('');
    try {
      const res = await axios.post(
        `${API_URL}/returns/send-otp`,
        { orderId: order._id || order.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setStep('otp-verify');
        startTimer();
        if (res.data.otp) {
          setOtp(res.data.otp);
          setDevOtp(res.data.otp);
        }
      } else {
        setError(res.data.message || 'Failed to send OTP');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 2: Verify OTP ==========
  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return setError('Enter 6-digit OTP');
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `${API_URL}/returns/verify-otp`,
        { orderId: order._id || order.id, otp: otp.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setReturnToken(res.data.returnToken);

        // Bank details check karo
        const bankRes = await axios.get(`${API_URL}/bank-details`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (bankRes.data.bankDetails) {
          setBank({
            accountHolderName: bankRes.data.bankDetails.accountHolderName || '',
            accountNumber: bankRes.data.bankDetails.accountNumber || '',
            ifscCode: bankRes.data.bankDetails.ifscCode || '',
            bankName: bankRes.data.bankDetails.bankName || '',
            upiId: bankRes.data.bankDetails.upiId || ''
          });
          setStep('form');
        } else {
          setStep('bank');
        }
      } else {
        setError(res.data.message || 'OTP verification failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 3: Save Bank ==========
  const saveBank = async (e) => {
    e.preventDefault();
    if (!bank.accountHolderName || !bank.accountNumber || !bank.ifscCode || !bank.bankName) {
      return setBankError('All bank fields are required');
    }
    setBankError('');
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/bank-details`,
        bank,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setStep('form');
      } else {
        setBankError(res.data.message || 'Failed to save bank details');
      }
    } catch (err) {
      setBankError(err.response?.data?.message || 'Failed to save bank details');
    } finally {
      setLoading(false);
    }
  };

  // ========== STEP 4: Submit Return ==========
  const submitReturn = async () => {
    const items = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({ productId, qty }));

    if (items.length === 0) return setSubmitError('Select at least one item');
    if (!reason) return setSubmitError('Select a reason');

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await axios.post(
        `${API_URL}/returns`,
        {
          orderId: order._id || order.id,
          items,
          reason,
          description,
          returnToken
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setStep('done');
        if (onSuccess) onSuccess(res.data.returnRequest);
      } else {
        setSubmitError(res.data.message || 'Failed to submit return');
      }
    } catch (err) {
      setSubmitError(err.response?.data?.message || 'Failed to submit return');
    } finally {
      setSubmitting(false);
    }
  };

  // Refund estimate
  const refundAmount = Object.entries(selectedItems).reduce((sum, [pid, qty]) => {
    const item = (order.items || []).find(i => (i.product_id || i._id || i.id) === pid);
    return sum + ((item?.price || 0) * qty);
  }, 0);

  // Overlay render
  return (
    <div
      className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-100 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-black font-bold text-lg"
        >
          ✕
        </button>

        {/* STEP 1: OTP Sending */}
        {step === 'otp' && (
          <>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">↩️</span>
              <h3 className="text-lg font-black text-[#0B3C5D]">Return Request</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              OTP bhejenge aapke registered mobile pe verify karne ke liye.
            </p>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                {error}
              </div>
            )}
            <button
              onClick={sendOtp}
              disabled={loading}
              className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] disabled:opacity-50"
            >
              {loading ? '⏳ Sending OTP...' : '📱 Send OTP'}
            </button>
          </>
        )}

        {/* STEP 2: Verify OTP */}
        {step === 'otp-verify' && (
          <>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📱</span>
              <h3 className="text-lg font-black text-[#0B3C5D]">Verify OTP</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Enter 6-digit OTP sent to your registered mobile.
            </p>
            {devOtp && <TestModeBanner otp={devOtp} />}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                {error}
              </div>
            )}
            <form onSubmit={verifyOtp} className="space-y-4">
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm text-center text-2xl font-bold tracking-widest focus:outline-none focus:border-[#0B3C5D]"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {timer > 0 ? `Resend in ${timer}s` : "Didn't receive OTP?"}
                </span>
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={resendDisabled || loading}
                  className="font-bold text-[#0B3C5D] hover:underline disabled:opacity-50"
                >
                  Resend OTP
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] disabled:opacity-50"
              >
                {loading ? '⏳ Verifying...' : '✅ Verify OTP'}
              </button>
            </form>
          </>
        )}

        {/* STEP 3: Bank Details */}
        {step === 'bank' && (
          <>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🏦</span>
              <h3 className="text-lg font-black text-[#0B3C5D]">Bank Details</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Refund isi account mein aayega. Ye details safe rahengi.
            </p>
            {bankError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                {bankError}
              </div>
            )}
            <form onSubmit={saveBank} className="space-y-3">
              <input
                placeholder="Account Holder Name *"
                value={bank.accountHolderName}
                onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
              />
              <input
                placeholder="Account Number * (9-18 digits)"
                value={bank.accountNumber}
                onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
              />
              <input
                placeholder="IFSC Code * (e.g., SBIN0001234)"
                value={bank.ifscCode}
                onChange={(e) => setBank({ ...bank, ifscCode: e.target.value.toUpperCase() })}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
              />
              <input
                placeholder="Bank Name *"
                value={bank.bankName}
                onChange={(e) => setBank({ ...bank, bankName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
              />
              <input
                placeholder="UPI ID (optional)"
                value={bank.upiId}
                onChange={(e) => setBank({ ...bank, upiId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] disabled:opacity-50"
              >
                {loading ? '⏳ Saving...' : '💾 Save & Continue'}
              </button>
            </form>
          </>
        )}

        {/* STEP 4: Return Form */}
        {step === 'form' && (
          <>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📦</span>
              <h3 className="text-lg font-black text-[#0B3C5D]">Return Details</h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Select items and reason for return.
            </p>

            {/* Item select */}
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-2">
                Select Items *
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-100 rounded-xl p-2">
                {(order.items || []).map((item) => {
                  const pid = item.product_id || item._id || item.id;
                  return (
                    <div key={pid} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
                      <input
                        type="checkbox"
                        checked={selectedItems[pid] > 0}
                        onChange={(e) => {
                          setSelectedItems(prev => ({
                            ...prev,
                            [pid]: e.target.checked ? 1 : 0
                          }));
                        }}
                        className="w-4 h-4"
                      />
                      <img
                        src={item.image || getProductDisplayImage(item)}
                        alt=""
                        className="w-10 h-10 rounded object-cover border"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-slate-800 truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-500">{formatCurrency(item.price)} × max {item.qty}</div>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={item.qty}
                        value={selectedItems[pid] || 1}
                        onChange={(e) => setSelectedItems(prev => ({
                          ...prev,
                          [pid]: Math.min(item.qty, Math.max(1, Number(e.target.value) || 1))
                        }))}
                        className="w-14 border rounded px-1 py-0.5 text-xs text-center"
                        disabled={!selectedItems[pid]}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reason */}
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Reason *
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
              >
                <option value="">Select reason</option>
                {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Description */}
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] resize-none"
                placeholder="Details batao..."
              />
            </div>

            {/* Refund estimate */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
              <div className="text-xs">
                <span className="font-bold">Estimated Refund:</span> {formatCurrency(refundAmount)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Approve hone ke baad aapke bank account mein aayega
              </div>
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-3">
                {submitError}
              </div>
            )}

            <button
              onClick={submitReturn}
              disabled={submitting}
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl text-sm hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? '⏳ Submitting...' : '↩️ Submit Return Request'}
            </button>
          </>
        )}

        {/* STEP 5: Done */}
        {step === 'done' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-lg font-black text-[#0B3C5D] mb-2">Return Submitted!</h3>
            <p className="text-xs text-slate-500 mb-4">
              Aapki return request admin ke paas bhej di gayi hai. Status update hone pe notify karenge.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================
// FORGOT PASSWORD MODAL
// =============================================
const ForgotPasswordModal = ({ isOpen, onClose, onBackToLogin }) => {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(0);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [testModeOtp, setTestModeOtp] = useState('');

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer(prev => prev - 1);
      }, 1000);
    } else {
      setResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const startTimer = () => {
    setTimer(60);
    setResendDisabled(true);
  };

  useEffect(() => {
    if (!isOpen) {
      setStep('phone');
      setPhone('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setError('');
      setSuccess('');
      setLoading(false);
      setTestModeOtp('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setTestModeOtp('');

    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { phone });
      
      if (response.data.success) {
        setStep('otp');
        startTimer();
        if (response.data.otp) {
          setOtp(response.data.otp);
          setTestModeOtp(response.data.otp);
          setSuccess('✅ Test Mode — OTP auto-filled.');
        } else {
          setSuccess('✅ If an account exists, an OTP has been sent to its registered mobile number.');
        }
      } else {
        setError(response.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${API_URL}/auth/verify-otp`, {
        phone,
        otp: otp.trim() 
      });
      
      if (response.data.success) {
        setSuccess('✅ OTP verified successfully!');
        setResetToken(response.data.resetToken);
        setStep('reset');
      } else {
        setError(response.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      setError('Password must be 8-72 characters long');
      setLoading(false);
      return;
    }

    if (!resetToken) {
      setError('Session expired. Please request a new OTP.');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${API_URL}/auth/reset-password`, {
        phone,
        newPassword,
        resetToken
      });
      
      if (response.data.success) {
        setSuccess('✅ Password reset successfully!');
        setTimeout(() => {
          onClose();
          onBackToLogin();
        }, 2000);
      } else {
        setError(response.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    setTestModeOtp('');

    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { phone });
      
      if (response.data.success) {
        startTimer();
        if (response.data.otp) {
          setOtp(response.data.otp);
          setTestModeOtp(response.data.otp);
          setSuccess('✅ Test Mode — OTP auto-filled.');
        } else {
          setSuccess('✅ If an account exists, a new OTP has been sent to its registered mobile number.');
        }
      } else {
        setError(response.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="velqra-auth-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 border border-slate-100 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-400 hover:text-black font-bold text-lg"
        >
          ✕
        </button>
        
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🔑</span>
          <h3 className="text-lg font-black text-[#0B3C5D]">
            {step === 'phone' && 'Forgot Password'}
            {step === 'otp' && 'Verify OTP'}
            {step === 'reset' && 'Reset Password'}
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          {step === 'phone' && 'Enter your registered mobile number to receive an OTP'}
          {step === 'otp' && `Enter the OTP sent to the mobile ending in ${phone.slice(-4)}`}
          {step === 'reset' && 'Create a new password for your account'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
            {success}
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Registered Mobile Number</label>
              <input
                type="tel"
                required
                inputMode="numeric"
                autoComplete="tel"
                minLength="10"
                maxLength="14"
                pattern="[6-9][0-9]{9}"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(-10))}
                placeholder="10-digit mobile number"
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] transition disabled:opacity-50"
            >
              {loading ? '⏳ Sending...' : 'Send OTP'}
            </button>
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full text-center text-[10px] text-slate-400 hover:text-[#0B3C5D] transition"
            >
              ← Back to Login
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            {testModeOtp && <TestModeBanner otp={testModeOtp} />}

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">OTP Code</label>
              <input
                type="text"
                required
                maxLength="6"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit OTP"
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition text-center text-2xl font-bold tracking-widest"
              />
              <p className="text-[10px] text-slate-400 mt-1 text-center">OTP sent to mobile ending in {phone.slice(-4)}</p>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {timer > 0 ? `Resend in ${timer}s` : "Didn't receive OTP?"}
              </span>
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={resendDisabled || loading}
                className="font-bold text-[#0B3C5D] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Resend OTP
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] transition disabled:opacity-50"
            >
              {loading ? '⏳ Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-center text-[10px] text-slate-400 hover:text-[#0B3C5D] transition"
            >
              ← Change Mobile Number
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength="8"
                maxLength="72"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
              />
              <p className="text-[9px] text-slate-400 mt-1">Password must be 8-72 characters long</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                minLength="8"
                maxLength="72"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-green-700 transition disabled:opacity-50"
            >
              {loading ? '⏳ Resetting...' : '🔓 Reset Password'}
            </button>

            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full text-center text-[10px] text-slate-400 hover:text-[#0B3C5D] transition"
            >
              ← Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// 🆕 ORDER OTP MODAL
// ═══════════════════════════════════════════════════
const OrderOTPModal = ({ isOpen, onClose, onVerified }) => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(0);
  const [resendDisabled, setResendDisabled] = useState(false);
  const [testModeOtp, setTestModeOtp] = useState('');
  const [autoSending, setAutoSending] = useState(false);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    } else {
      setResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (isOpen) {
      sendOrderOTP();
    } else {
      setOtp('');
      setError('');
      setSuccess('');
      setTestModeOtp('');
      setTimer(0);
    }
  }, [isOpen]);

  const startTimer = () => {
    setTimer(60);
    setResendDisabled(true);
  };

  const sendOrderOTP = async () => {
    setAutoSending(true);
    setError('');
    setSuccess('');
    setTestModeOtp('');
    try {
      const token = sessionStorage.getItem('velqra_user_token');
      const res = await axios.post(`${API_URL}/orders/send-otp`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        startTimer();
        if (res.data.otp) {
          setOtp(res.data.otp);
          setTestModeOtp(res.data.otp);
          setSuccess('🧪 Test Mode — OTP auto-filled.');
        } else {
          setSuccess('✅ OTP sent to your mobile.');
        }
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setAutoSending(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    if (otp.length !== 6) {
      setError('Enter 6-digit OTP');
      setLoading(false);
      return;
    }
    try {
      const token = sessionStorage.getItem('velqra_user_token');
      const res = await axios.post(`${API_URL}/orders/verify-otp`, { otp: otp.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setSuccess('✅ OTP verified! Placing order...');
        setTimeout(() => onVerified(res.data.orderConfirmToken), 800);
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-black font-bold text-lg">✕</button>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🔐</span>
          <h3 className="text-lg font-black text-[#0B3C5D]">Order Confirmation</h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">Verify OTP to confirm your order</p>

        {autoSending && !testModeOtp && (
          <div className="bg-blue-50 border border-blue-200 text-blue-600 text-xs font-medium px-4 py-2 rounded-xl mb-4 flex items-center gap-2">
            <span className="animate-spin">⏳</span> Sending OTP to your mobile...
          </div>
        )}

        {testModeOtp && <TestModeBanner otp={testModeOtp} />}
        {error && <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">{success}</div>}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Enter OTP</label>
            <input
              type="text"
              required
              maxLength="6"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit OTP"
              className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] text-center text-2xl font-bold tracking-widest"
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{timer > 0 ? `Resend in ${timer}s` : "Didn't get OTP?"}</span>
            <button
              type="button"
              onClick={sendOrderOTP}
              disabled={resendDisabled || autoSending}
              className="font-bold text-[#0B3C5D] hover:underline disabled:opacity-50"
            >
              Resend OTP
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || otp.length < 6}
            className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] disabled:opacity-50"
          >
            {loading ? '⏳ Verifying...' : '🔓 Verify & Place Order'}
          </button>
          <button type="button" onClick={onClose} className="w-full text-center text-[10px] text-slate-400 hover:text-[#0B3C5D]">← Cancel</button>
        </form>
      </div>
    </div>
  );
};


// =============================================
// ABOUT PAGE
// =============================================
const POLICY_CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'VELQRA explains below how information submitted through this website is used.',
    sections: [
      ['Information we collect', 'We collect account, contact and delivery details, order and payment confirmation information, support communications, device and browser data, and cookies required to operate and secure the website.'],
      ['How we use information', 'Information is used to create accounts, process and support orders, communicate status updates and maintain service security.'],
      ['Data protection', 'We take reasonable measures to protect stored information. No website or payment system can guarantee absolute security; please do not share passwords, OTPs or complete card details.'],
      ['Purpose and lawful processing', 'Information is processed to verify accounts, fulfill purchases, prevent fraud, arrange delivery, respond to support requests, improve services and comply with applicable financial and legal record requirements.'],
      ['Requests and retention', 'For a correction or account request, email officialvelqra@gmail.com. Certain records may be retained where needed to resolve an order, prevent fraud or meet applicable requirements.']
    ]
  },
  terms: {
    title: 'Terms & Conditions',
    intro: 'These terms apply to purchases made through the VELQRA storefront.',
    sections: [
      ['Website use', 'You must provide accurate account, billing and delivery information and must not misuse the website, interfere with security controls, attempt unauthorized access or conduct fraudulent transactions.'],
      ['Consumer disclosures', 'The displayed product description, final price, delivery charge, payment method, estimated delivery and applicable policies are shown before order confirmation. Packaging or presentation may vary from illustrative imagery.'],
      ['Orders and availability', 'An order is confirmed only after successful placement and confirmation. Products, prices and availability may change before dispatch.'],
      ['Pricing and payment', 'Prices are displayed in INR. Any delivery charge or discount applicable to an order will be shown before payment confirmation.'],
      ['Account responsibility', 'Keep login credentials confidential and notify support promptly if you suspect unauthorized account activity.']
    ]
  },
  returns: {
    title: 'Return & Refund Policy',
    intro: 'Return eligibility depends on the item condition and the reason reported for the request.',
    sections: [
      ['Return request', 'Report damaged, defective, incorrect or missing items within 48 hours of delivery, with the order ID and clear photos.'],
      ['Eligible items', 'Products must be unused, in original packaging and include all accessories, labels and free items received with the order.'],
      ['Sealed package requirement', 'Returns are accepted only when the original product seal remains intact and the package is unused. Refund is not available for opened, unsealed or tampered products.'],
      ['Return deadline', 'A return request must be submitted within 7 days of delivery. The return option disappears automatically after this period.'],
      ['Online payment refund', 'Returns and refunds are available only for orders paid online. The exact order ID must be entered to confirm the return request.'],
      ['Refunds', 'Approved refunds are processed to the original payment method. Cash-on-delivery refunds may require verified bank details.'],
      ['Non-returnable items', 'Personal care, hygiene, opened consumables and specially customized products may not be returnable unless they arrived damaged or defective.']
    ]
  },
  shipping: {
    title: 'Shipping Policy',
    intro: 'Dispatch and delivery estimates may vary by location, product availability and courier conditions.',
    sections: [
      ['Processing time', 'Most confirmed orders are processed within 1-3 business days, excluding public holidays and service disruptions.'],
      ['Delivery time', 'Delivery timelines vary by location and product. The estimated date shown at checkout is indicative and may change due to courier availability.'],
      ['Shipping address', 'Customers must provide a complete and accurate delivery address. Failed delivery caused by incorrect information may incur additional charges.'],
      ['Tracking', 'Tracking details are shared when available. Contact support if your order has not moved within the expected processing period.'],
      ['Service coverage', 'Availability, courier coverage and delivery estimates depend on the destination PIN code. Remote-area charges or additional transit time, if applicable, will be communicated before dispatch or settlement.'],
      ['Delivery confirmation', 'Where permitted, inspect the outer package before accepting it. Report visible damage, leakage, missing items or an altered seal immediately with photographs through Contact Policy.']
    ]
  },
  contact: {
    title: 'Contact Policy',
    intro: 'Contact support using the verified details shown in the footer for order, payment, delivery or account questions.',
    sections: [
      ['Support email', 'Email officialvelqra@gmail.com with your order number and a clear description of the issue.'],
      ['Phone and WhatsApp', 'Call or WhatsApp us at +91 90500 54177 for order, payment, delivery or account support.'],
      ['Location', 'Near Priyanka Dhaba, Balaji Hospital, Ward No. 11, Ateli Mandi, Mahendragarh, Haryana. Map coordinates: 28.1038478, 76.2499368.'],
      ['Response time', 'We aim to respond within 1-2 business days. Order or delivery cases may require additional time for courier verification.'],
      ['Information required', 'Please include your registered name, order ID and relevant screenshots. Do not share passwords, full card numbers or OTPs.'],
      ['Escalations', 'If a resolution remains unresolved, reply to the latest support email and mark the message for follow-up.']
    ]
  }
};

const PolicyPage = ({ policy }) => {
  const content = POLICY_CONTENT[policy];
  return (
    <main className="min-h-[70vh] bg-[#f1f1ef] px-4 py-8 text-[#252525] sm:px-6 md:py-14">
      <article className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-2xl bg-[#173b32] px-6 py-9 text-white shadow-sm sm:px-9 md:px-12 md:py-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d4af37]">VELQRA · Information</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl md:text-[42px]">{content.title}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/80 sm:text-base">{content.intro}</p>
        </div>

        <div className="mt-6 space-y-3 sm:mt-8 sm:space-y-4">
          {content.sections.map(([heading, text], index) => (
            <section key={heading} className="flex gap-4 rounded-xl border border-[#e2e1da] bg-white p-5 shadow-[0_3px_14px_rgba(20,35,28,0.035)] sm:gap-5 sm:p-6 md:p-7">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf2ed] text-xs font-bold tracking-wide text-[#173b32]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0 pt-1">
                <h2 className="text-base font-semibold leading-snug text-[#202020] sm:text-lg">{heading}</h2>
                <p className="mt-2 text-sm leading-7 text-[#555] sm:text-[15px] sm:leading-7">{text}</p>
              </div>
            </section>
          ))}
        </div>

        {policy === 'contact' && (
          <div className="mt-6 overflow-hidden rounded-xl border border-[#e2e1da] bg-white p-2 shadow-sm sm:mt-8">
            <iframe
              title="VELQRA location map"
              src="https://www.google.com/maps?q=28.1038478,76.2499368&z=19&output=embed"
              className="h-64 w-full rounded-lg border-0 sm:h-80"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        )}

        <p className="mt-6 text-right text-xs text-[#777]">Last updated: November 2026</p>
      </article>
    </main>
  );
};

const NotFoundPage = () => (
  <main className="flex min-h-[60vh] items-center justify-center bg-[#f1f1ef] px-4 py-16 text-center text-[#252525]">
    <section className="max-w-lg">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#173b32]">404 · Page not found</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">This page doesn’t exist</h1>
      <p className="mt-3 text-sm leading-6 text-[#626262]">
        The link may be incorrect or the page may have moved. Visit the home page to continue shopping.
      </p>
      <Link
        to="/"
        className="mt-7 inline-flex rounded-lg bg-[#173b32] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#102a24]"
      >
        Back to home
      </Link>
    </section>
  </main>
);

const DeveloperAboutLegacyPage = () => {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="text-center mb-12">
        <span className="inline-block bg-[#0B3C5D]/10 text-[#0B3C5D] text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3">
          About Us
        </span>
        <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-4">
          Welcome to <span className="text-[#0B3C5D]">Ateli</span>
          <span className="text-[#FF5722]">Market</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Your trusted online shopping destination. Quality products, best prices, and exceptional service.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          <div className="md:col-span-1 bg-gradient-to-br from-[#0B3C5D] to-[#1a6496] p-8 flex items-center justify-center">
            <div className="relative">
              <div className="w-48 h-48 rounded-full border-4 border-white/20 overflow-hidden shadow-2xl">
                <img 
                  src="/Dev.jpg" 
                  alt="Gourav Sharma - Developer" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://ui-avatars.com/api/?name=Gourav+Sharma&size=200&background=0B3C5D&color=fff';
                  }}
                />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                🚀 Active
              </div>
            </div>
          </div>
          <div className="md:col-span-2 p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2 flex items-center gap-2">
              <span>👨‍💻</span> Developer
            </h2>
            <h3 className="text-2xl font-bold text-[#0B3C5D] mb-1">Gourav Sharma</h3>
            <p className="text-sm font-medium text-[#FF5722] mb-2">B.Tech Final Year Student</p>
            <p className="text-sm text-slate-500 mb-4">IGU University, Meerpur</p>
            <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed">
                I'm Gourav Sharma, a passionate B.Tech final year student at IGU University 
                with a strong interest in full-stack web development. I built VELQRA to
                create a seamless online shopping experience using modern technologies like 
                React, Node.js, and Supabase.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-xs font-bold uppercase text-slate-400 mb-3">Connect with Developer</p>
              <div className="flex flex-wrap gap-3">
                <a href="https://github.com/pandit777" target="_blank" rel="noopener noreferrer" className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.62.24 2.85.12 3.15.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span className="text-sm font-medium">GitHub</span>
                </a>
                <a href="mailto:officialvelqra@gmail.com" className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <span className="text-sm font-medium">Email</span>
                </a>
                <a href="tel:+919050054177" className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                  <span className="text-sm font-medium">Phone</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AboutPage = () => (
  <main className="min-h-[60vh] bg-[#f1f1ef] px-4 py-8 text-[#252525] sm:px-6 md:py-14" aria-label="About VELQRA">
    <article className="mx-auto max-w-6xl">
      <div className="overflow-hidden rounded-2xl bg-[#173b32] px-6 py-10 text-white shadow-sm sm:px-10 md:px-14 md:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d4af37]">About VELQRA</p>
        <h1 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
          Thoughtful skincare, made part of everyday life.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
          VELQRA brings together botanical-inspired skincare and a straightforward way to shop, so choosing everyday care feels clear and considered.
        </p>
      </div>

      <section className="grid gap-8 py-10 md:grid-cols-[1.2fr_0.8fr] md:gap-14 md:py-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8b6e2d]">Our point of view</p>
          <h2 className="mt-3 font-serif text-2xl font-semibold leading-snug text-[#202020] sm:text-3xl">
            Good shopping starts with clarity.
          </h2>
        </div>
        <p className="text-sm leading-7 text-[#555] sm:text-base">
          From product details to delivery information, we aim to make the essentials easy to understand. Our focus is on considered product presentation, transparent information and dependable customer support.
        </p>
      </section>

      <section aria-label="What you can expect" className="grid gap-4 border-t border-[#dedede] py-8 sm:grid-cols-3 md:py-10">
        {[
          ['01', 'Considered products', 'Explore skincare selected for a simple, everyday routine.'],
          ['02', 'Clear information', 'Find product, order and policy details in one easy-to-navigate store.'],
          ['03', 'Here to help', 'Reach our support team when you need help with an order or account.']
        ].map(([number, title, description]) => (
          <div key={number} className="rounded-xl border border-[#e1e0da] bg-white p-5 sm:p-6">
            <p className="text-xs font-bold tracking-[0.16em] text-[#8b6e2d]">{number}</p>
            <h3 className="mt-3 text-base font-semibold text-[#202020]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#626262]">{description}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-[#deded7] bg-[#e9e9e3] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h2 className="text-lg font-semibold text-[#202020]">Need a hand?</h2>
          <p className="mt-1 text-sm leading-6 text-[#626262]">Our support team can help with orders, delivery and account questions.</p>
        </div>
        <Link
          to="/contact-policy"
          className="inline-flex shrink-0 justify-center rounded-lg bg-[#173b32] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#102a24]"
        >
          Contact us
        </Link>
      </section>
    </article>
  </main>
);

// =============================================
// PRODUCT DETAIL PAGE - WITH VIDEO & ATTRIBUTES
// =============================================
const ProductDetailPage = ({ addToCart, openCheckout }) => {
  const { t, formatCurrency } = useLocalization();
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [mainImage, setMainImage] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState({});
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProductDetails = async () => {
      const cachedProduct = getCachedProducts().find(item => String(item._id || item.id) === id);
      if (cachedProduct) {
        const productData = normalizeProduct(cachedProduct);
        setProduct(productData);
        const cachedImage = getProductDisplayImage(productData);
        setMainImage(cachedImage);
        setSelectedImage(cachedImage);
        if (productData.attributes && typeof productData.attributes === 'object') {
          setSelectedAttributes(Object.fromEntries(
            Object.entries(productData.attributes)
              .filter(([, values]) => Array.isArray(values) && values.length > 0)
              .map(([key, values]) => [key, values[0]])
          ));
        }
        setLoading(false);
      }

      try {
        if (!cachedProduct) setLoading(true);
        if (!isSupabaseConfigured) {
          if (cachedProduct) return;
          throw new Error('Supabase is not configured');
        }
        let result = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (result.error?.code === '42703') {
          result = await supabase
            .from('products')
            .select('*')
            .eq('_id', id)
            .maybeSingle();
        }

        const { data, error } = result;

        if (error) throw error;
        if (data) {
          const productData = normalizeProduct(data);
          setProduct(productData);
          
          const mainImg = getProductDisplayImage(productData);
          setMainImage(mainImg);
          setSelectedImage(mainImg);
          
          if (productData.attributes && typeof productData.attributes === 'object') {
            const initialAttrs = {};
            Object.keys(productData.attributes).forEach(key => {
              const values = productData.attributes[key];
              if (Array.isArray(values) && values.length > 0) {
                initialAttrs[key] = values[0];
              }
            });
            setSelectedAttributes(initialAttrs);
          }
        } else {
          if (!cachedProduct) setError('Product not found');
        }
      } catch (err) {
        if (!cachedProduct) setError(err.message || err.response?.data?.message || 'Failed to fetch product');
      } finally {
        setLoading(false);
      }
    };
    fetchProductDetails();
  }, [id]);

  const handleAddToCart = async () => {
    if (!product || addingToCart) return false;
    
    if (product.attributes && Object.keys(product.attributes).length > 0) {
      const allSelected = Object.keys(product.attributes).every(key => {
        return selectedAttributes[key] && selectedAttributes[key].trim() !== '';
      });
      
      if (!allSelected) {
        alert('Please select all options before adding to cart.');
        return false;
      }
    }
    
    const productWithAttributes = {
      ...product,
      selectedAttributes,
      promoApplied,
      promoCode: promoApplied ? product.promoCode : '',
      price: promoApplied
        ? Math.round(product.price * (1 - (Number(product.promoDiscount) || 0) / 100))
        : product.price
    };
    
    setAddingToCart(true);
    try {
      if (addToCart) {
        return await addToCart(productWithAttributes);
      }
      const event = new CustomEvent('addToCart', { detail: productWithAttributes });
      window.dispatchEvent(event);
      return true;
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    const added = await handleAddToCart();
    if (added && openCheckout) openCheckout();
  };

  const handleAttributeChange = (key, value) => {
    setSelectedAttributes(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const applyProductPromo = () => {
    if (!product?.promoCode) {
      return;
    }
    if (promoInput.trim().toUpperCase() === String(product.promoCode).toUpperCase()) {
      setPromoApplied(true);
    } else {
      setPromoApplied(false);
      alert('Invalid promo code for this product.');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B3C5D]"></div>
        <p className="text-slate-400 mt-4 font-medium">Loading product details...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">😕</div>
        <h3 className="text-red-500 font-bold text-lg">{error || 'Product not found'}</h3>
        <Link to="/" className="mt-4 inline-block bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#07263b] transition">
          ← Back to Shopping
        </Link>
      </div>
    );
  }

  const images = product.images?.filter(Boolean) || [mainImage];
  const hasAttributes = product.attributes && Object.keys(product.attributes).length > 0;
  const hasVideo = product.videoUrl && product.videoUrl.trim() !== '';
  const youtubeId = getYouTubeId(product.videoUrl);
  const vimeoId = getVimeoId(product.videoUrl);
  const promoPrice = promoApplied
    ? Math.round(product.price * (1 - (Number(product.promoDiscount) || 0) / 100))
    : product.price;
  const promoSavings = promoApplied ? product.price - promoPrice : 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 overflow-x-hidden text-[#171717]">
      <nav className="mb-6 text-sm text-slate-400 break-words">
        <Link to="/" className="hover:text-[#0B3C5D] transition">Home</Link>
        <span className="mx-2">/</span>
        <Link to={`/?category=${product.category}`} className="hover:text-[#0B3C5D] transition">{product.category}</Link>
        <span className="mx-2">/</span>
        <span className="font-medium text-slate-700 break-words">{product.name}</span>
      </nav>

      <div className="grid w-full grid-cols-1 gap-8 md:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <img 
              src={selectedImage || mainImage} 
              alt={product.name}
              className="h-96 w-full max-w-full object-contain rounded-xl"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = getProductDisplayImage(product);
              }}
            />
          </div>
          
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {images.map((img, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(img)}
                  className={`flex-shrink-0 w-20 h-20 rounded-xl border-2 overflow-hidden transition ${
                    selectedImage === img ? 'border-[#0B3C5D] shadow-md' : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <img 
                    src={img} 
                    alt={`${product.name} ${index + 1}`}
                    className="w-full h-full object-contain bg-white p-1"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = getProductDisplayImage(product);
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-6 break-words">
          <div>
            <span className="inline-block bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3">
              {product.category}
            </span>
            <h1 className="w-full break-words [overflow-wrap:anywhere] text-3xl font-black leading-tight text-[#171717] sm:text-4xl">{product.name}</h1>
            {product.brand && (
              <p className="text-sm text-slate-500 mt-1">{t('Brand:')} <span className="font-medium">{product.brand}</span></p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-black text-[#173b32]">{formatCurrency(promoPrice)}</span>
              {product.discountPercent > 0 && (
                <>
                  <span className="text-lg text-slate-500 line-through">{formatCurrency(product.originalPrice)}</span>
                  {promoApplied && (
                    <span className="text-sm text-slate-500 line-through">{formatCurrency(product.price)}</span>
                  )}
                  <span className="bg-green-100 text-green-700 font-bold text-sm px-3 py-1 rounded-full">
                    -{product.discountPercent}% OFF
                  </span>
                </>
              )}
            </div>
            {product.discountPercent > 0 && (
              <p className="text-sm text-green-600 font-medium mt-1">
                {t('You save')} {formatCurrency(product.originalPrice - promoPrice)}
              </p>
            )}
            {!product.discountPercent && promoApplied && (
              <p className="text-sm text-green-600 font-medium mt-1">
                {t('Promo savings')}: {formatCurrency(promoSavings)}
              </p>
            )}
          </div>

          {product.promoCode && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-green-700">{t('Promo offer on this product')}</p>
              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => {
                    setPromoInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                    setPromoApplied(false);
                  }}
                  placeholder={t('Enter promo code')}
                  className="min-w-0 flex-1 rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm font-bold uppercase text-black caret-black placeholder:text-slate-500 outline-none focus:border-green-600"
                />
                <button
                  type="button"
                  onClick={applyProductPromo}
                  className="rounded-xl bg-green-700 px-4 text-sm font-bold text-white hover:bg-green-800"
                >
                  {t('Apply')}
                </button>
              </div>
              {promoApplied && (
                <p className="mt-3 text-sm font-bold text-green-700">
                  {product.promoDiscount}% extra discount applied — save {formatCurrency(Math.round(product.price * product.promoDiscount / 100))}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={handleAddToCart}
              disabled={product.stock <= 0 || addingToCart}
              className={`rounded-xl py-3.5 font-bold text-sm uppercase tracking-wide transition ${
                product.stock > 0
                  ? 'bg-amber-400 text-black hover:bg-amber-500 shadow-md'
                  : 'cursor-not-allowed bg-slate-700 text-slate-400'
              }`}
            >
              {product.stock <= 0 ? t('Out of Stock') : addingToCart ? t('Adding...') : t('Add to Cart')}
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={product.stock <= 0 || addingToCart}
              className="rounded-xl border border-[#173b32] bg-transparent py-3.5 text-sm font-bold uppercase tracking-wide text-[#173b32] transition hover:bg-[#173b32] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('Buy Now')}
            </button>
          </div>

          {/* ✅ ATTRIBUTES */}
          {hasAttributes && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-sm text-slate-700 mb-4 flex items-center gap-2">
                <span>📋</span> {t('Select Options')}
              </h3>
              <div className="space-y-4">
                {Object.entries(product.attributes).map(([key, values]) => (
                  <div key={key}>
                      <label className="mb-1.5 block break-words text-xs font-bold uppercase text-slate-400">
                      {key}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Array.isArray(values) && values.map((value) => (
                        <button
                          key={value}
                          onClick={() => handleAttributeChange(key, value)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition border-2 ${
                            selectedAttributes[key] === value
                              ? 'border-[#0B3C5D] bg-[#0B3C5D] text-white shadow-md'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-[#0B3C5D] hover:bg-slate-50'
                          }`}
                        >
                          <span className="break-words">{value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-400">
                {Object.keys(selectedAttributes).length > 0 && (
                  <span>{t('Selected:')} {Object.entries(selectedAttributes).map(([key, value]) => `${key}: ${value}`).join(', ')}</span>
                )}
              </div>
            </div>
          )}

          {/* ✅ VIDEO */}
          {hasVideo && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                <span>🎬</span> {t('Product Video')}
              </h3>
              <div className="aspect-w-16 aspect-h-9 rounded-xl overflow-hidden bg-slate-100">
                {product.videoType === 'youtube' && youtubeId ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    title={product.name}
                    className="w-full h-full min-h-[200px]"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : product.videoType === 'vimeo' && vimeoId ? (
                  <iframe
                    src={`https://player.vimeo.com/video/${vimeoId}`}
                    title={product.name}
                    className="w-full h-full min-h-[200px]"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full min-h-[200px] flex flex-col items-center justify-center text-slate-400">
                    <span className="text-4xl mb-2">🎬</span>
                    <p className="text-sm">Video not available</p>
                    <p className="text-xs text-slate-300 mt-1">{product.videoUrl || 'No video URL provided'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
              <span className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="font-bold text-sm">
                {product.stock > 0 ? t('In Stock ({count} available)', { count: product.stock }) : t('Out of Stock')}
              </span>
            </div>
          </div>

          {product.description && (
            <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-2">
                <span>📝</span> {t('Description')}
              </h3>
              <p className="w-full break-words whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-600">
                {product.description}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Link to="/" className="px-6 py-3.5 rounded-xl font-bold text-sm border border-slate-300 text-slate-700 hover:bg-slate-100 transition">
              ← Back
            </Link>
          </div>

          <div className="flex justify-center gap-6 text-xs text-slate-400 pt-4 border-t border-slate-100">
            <span>✅ Secure Checkout</span>
            <span>🚚 Free Delivery</span>
            <span>🔄 7-Day Return</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================
// ORDERS PAGE
// =============================================
const OrdersPage = ({ onLoginRequest }) => {
  const { t, formatCurrency, language } = useLocalization();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invoiceLoadingId, setInvoiceLoadingId] = useState(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem('velqra_user_token');
      
      if (!token) {
        setError('Please login to view orders');
        setLoading(false);
        return;
      }

      const response = await axios.get(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setOrders(response.data.orders || []);
      }
    } catch (err) {
      setError('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceDownload = async orderId => {
    setInvoiceLoadingId(orderId);
    try {
      await downloadOrderInvoice(orderId);
    } catch (downloadError) {
      window.alert(downloadError.message || 'Could not download invoice');
    } finally {
      setInvoiceLoadingId(null);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

    useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success') {
      alert('✅ Payment successful! Your order is confirmed.');
      window.history.replaceState({}, '', '/orders');
      fetchOrders();
    } else if (paymentStatus === 'failure') {
      alert('❌ Payment failed. You can retry from the order details.');
      window.history.replaceState({}, '', '/orders');
      fetchOrders();
    }
  }, []);


  const getStatusBadge = (status, paymentMethod) => {
    if (paymentMethod === 'cod') {
      const styles = {
        'Pending': 'bg-yellow-100 text-yellow-700',
        'Confirmed': 'bg-blue-100 text-blue-700',
        'Shipped': 'bg-purple-100 text-purple-700',
        'Delivered': 'bg-green-100 text-green-700',
        'Return Requested': 'bg-amber-100 text-amber-700',
        'Cancelled': 'bg-red-100 text-red-700'
      };
      return styles[status] || 'bg-slate-100 text-slate-700';
    } else {
      const styles = {
        'Payment Verification Pending': 'bg-orange-100 text-orange-700',
        'Payment Verified': 'bg-green-100 text-green-700',
        'Payment Failed': 'bg-red-100 text-red-700',
        'Confirmed': 'bg-blue-100 text-blue-700',
        'Shipped': 'bg-purple-100 text-purple-700',
        'Delivered': 'bg-green-100 text-green-700',
        'Return Requested': 'bg-amber-100 text-amber-700',
        'Cancelled': 'bg-red-100 text-red-700'
      };
      return styles[status] || 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusDisplay = (status, paymentMethod) => {
    return status;
  };

    const canCancelOrder = (order) => {
    if (order.status === 'Delivered' || order.status === 'Cancelled') return false;
    if (order.status === 'Shipped' || order.status === 'Confirmed' || order.status === 'Payment Verified') return false;
    if (order.paymentMethod === 'cod' && order.status === 'Pending') return true;
    if (order.paymentMethod === 'online' && (order.status === 'Payment Verification Pending' || order.status === 'Payment Failed')) return true;
    return false;
  };

  const getDeliveredAt = (order) => {
    const deliveredEntry = [...(order.statusHistory || [])]
      .reverse()
      .find((entry) => entry.status === 'Delivered');
    return deliveredEntry?.timestamp ? new Date(deliveredEntry.timestamp) : new Date(order.updatedAt || order.createdAt);
  };

    // ✅ NAYA: COD return + online return dono ke liye (7-day window check)
  const canRequestReturn = (order) => {
    if (order.status !== 'Delivered') return false;
    if (order.returnRequest) return false; // pehle se return hai
    if (!order.createdAt) return false;
    const deliveredAt = getDeliveredAt(order);
    if (Number.isNaN(deliveredAt.getTime())) return false;
    return Date.now() - deliveredAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
  };

  // ✅ Modal open karne ke liye
  const openReturnModal = (order) => {
    setReturnModalOrder(order);
  };

  // ✅ Return request cancel karne ke liye (sirf Pending tak)
  const handleCancelReturn = async (returnId) => {
    if (!window.confirm('Return cancel karna hai? Ye action undo nahi hoga.')) return;
    const token = sessionStorage.getItem('velqra_user_token');
    try {
      setLoading(true);
      const res = await axios.patch(
        `${API_URL}/returns/${returnId}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        alert('✅ Return cancelled successfully');
        fetchOrders();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel return');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    
    const token = sessionStorage.getItem('velqra_user_token');
    if (!token) {
      alert('Please login to cancel order');
      return;
    }
    
    try {
      setLoading(true);
      const response = await axios.patch(
        `${API_URL}/orders/${orderId}/cancel`,
        {},
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      
      if (response.data.success) {
        setOrders(prev => prev.map(order => 
          order._id === orderId ? { ...order, status: 'Cancelled' } : order
        ));
        alert('✅ Order cancelled successfully!');
        fetchOrders();
      } else {
        alert(response.data.message || 'Failed to cancel order');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B3C5D]"></div>
        <p className="text-slate-400 mt-4">{t('Loading your orders...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-red-500 font-bold">{error}</p>
        <button 
          onClick={onLoginRequest}
          className="mt-4 inline-block bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#07263b] transition"
        >
          {t('Login to view orders')}
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <span>📦</span> {t('My Orders')}
        </h1>
        <Link to="/" className="text-sm text-[#0B3C5D] font-bold hover:underline">
          ← {t('Continue Shopping')}
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="text-6xl mb-4">🛍️</div>
          <h3 className="font-bold text-lg text-slate-700">{t('No orders yet')}</h3>
          <p className="text-slate-400 text-sm mt-2">{t('Start shopping to place your first order!')}</p>
          <Link to="/" className="mt-4 inline-block bg-[#FF5722] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#e64a19] transition">
            {t('Browse Products')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isCOD = order.paymentMethod === 'cod';
            const statusDisplay = getStatusDisplay(order.status, order.paymentMethod);
            const statusBadgeClass = getStatusBadge(order.status, order.paymentMethod);
            const isCancellable = canCancelOrder(order);
            const invoiceAvailable = order.status === 'Delivered' ||
              (order.statusHistory || []).some(entry => entry?.status === 'Delivered');
            
            return (
              <div key={order._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-600">
                        #{order._id.slice(-8).toUpperCase()}
                      </span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusBadgeClass}`}>
                        {t(statusDisplay)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCOD ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isCOD ? `💵 ${t('Cash on Delivery')}` : `📱 ${t('Online Payment')}`}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleDateString(language === 'en' ? 'en-IN' : `${language}-IN`, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      <span className="text-slate-600">{order.items?.length || 0} {t((order.items?.length || 0) === 1 ? 'item' : 'items')}</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-[#0B3C5D]">{formatCurrency(order.total)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/orders/track/${order._id}`} className="bg-[#0B3C5D] text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-[#07263b] transition text-center whitespace-nowrap">
                      {t('Track Order')} →
                    </Link>
                    {invoiceAvailable && (
                      <button
                        type="button"
                        onClick={() => handleInvoiceDownload(order._id)}
                        disabled={invoiceLoadingId === order._id}
                        className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-100 transition whitespace-nowrap disabled:opacity-50"
                      >
                        {invoiceLoadingId === order._id ? t('Preparing PDF...') : t('Download Invoice PDF')}
                      </button>
                    )}
                    {isCancellable && (
                      <button onClick={() => handleCancelOrder(order._id)} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-100 transition whitespace-nowrap">
                        {t('Cancel Order')}
                      </button>
                    )}
                    {canRequestReturn(order) && (
                      <button
                        onClick={() => handleReturnRequest(order)}
                        className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-100 transition whitespace-nowrap"
                      >
                        {t('Request Return')}
                      </button>
                    )}
                  </div>
                </div>

                {order.items && order.items.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex items-center gap-3">
                          <img 
                            src={item.image || getProductDisplayImage(item)} 
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                            onError={(e) => e.target.src = 'https://via.placeholder.com/40?text=Product'}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                            {item.selectedAttributes && Object.keys(item.selectedAttributes).length > 0 && (
                              <div className="text-[9px] text-slate-400 flex gap-1 flex-wrap">
                                {Object.entries(item.selectedAttributes).map(([key, value]) => (
                                  value && <span key={key}>{key}: {value}</span>
                                ))}
                              </div>
                            )}
                            <p className="text-[10px] text-slate-500">{formatCurrency(item.price)} × {item.qty}</p>
                          </div>
                          <span className="text-xs font-bold text-[#0B3C5D]">{formatCurrency(item.price * item.qty)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================
// ORDER TRACKING
// =============================================
const OrderTracking = () => {
  const { t, formatCurrency, language } = useLocalization();
  const { orderId } = useParams();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrderTracking = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem('velqra_user_token');
      
      const response = await axios.get(
        `${API_URL}/orders/${orderId}/tracking`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTracking(response.data.tracking);
      } else {
        setError('Failed to fetch order details');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch order tracking');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderTracking();
  }, [orderId]);

  const getStatusBadge = (status) => {
    const styles = {
      'Order Placed': 'bg-orange-100 text-orange-700',
      'Payment Verification Pending': 'bg-yellow-100 text-yellow-700',
      'Order Confirmed': 'bg-yellow-100 text-yellow-700',
      'Confirmed': 'bg-yellow-100 text-yellow-700',
      'Payment Verified': 'bg-green-100 text-green-700',
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
        <p className="text-slate-400 mt-4 font-medium">{t('Loading order details...')}</p>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h3 className="text-red-500 font-bold text-lg">{t(error || 'Order not found')}</h3>
        <Link to="/orders" className="mt-4 inline-block bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#07263b] transition">
          ← {t('Back to Orders')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="bg-gradient-to-r from-[#0B3C5D] to-[#1a6496] text-white p-6 rounded-2xl shadow-lg mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              <span>📦</span> {t('Order Tracking')}
            </h2>
            <p className="text-sm opacity-80 mt-1 font-mono">
              {t('Order ID:')} #{tracking.orderId?.slice(-8).toUpperCase()}
            </p>
            <p className="text-xs opacity-70 mt-1">
              {t('Placed')}: {new Date(tracking.createdAt).toLocaleDateString(language === 'en' ? 'en-IN' : `${language}-IN`, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
            <span className="text-xs font-bold uppercase tracking-wider">{t('Status:')}</span>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${getStatusBadge(tracking.currentStatus)}`}>
              {t(tracking.currentStatus)}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
        <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
          <span>🚚</span> {t('Delivery Timeline')}
        </h3>
        <div className="space-y-6 relative">
          {tracking.timeline?.map((step, index) => (
            <div key={index} className="flex gap-4 relative">
              {index < tracking.timeline.length - 1 && (
                <div className={`absolute left-5 top-10 w-0.5 h-12 ${step.completed ? 'bg-green-500' : 'bg-slate-200'}`} />
              )}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl border-2 ${step.completed ? 'bg-green-100 border-green-500' : 'bg-slate-100 border-slate-300'}`}>
                {step.icon}
              </div>
              <div className="flex-1 pt-0.5">
                <div className={`font-bold text-sm ${step.completed ? 'text-slate-800' : 'text-slate-400'}`}>
                  {t(step.status)}
                </div>
                <div className={`text-xs ${step.completed ? 'text-slate-600' : 'text-slate-400'}`}>
                  {t(step.description)}
                </div>
                {step.timestamp && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    {new Date(step.timestamp).toLocaleString(language === 'en' ? 'en-IN' : `${language}-IN`, {
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

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
        <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          <span>📋</span> {t('Order Summary')}
        </h3>
        <div className="space-y-2">
          {tracking.items?.map((item, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <div className="flex items-center gap-3 flex-1">
                <img 
                  src={getProductDisplayImage(item)} 
                  alt={item.name}
                  className="w-10 h-10 object-cover rounded-lg border border-slate-200"
                  onError={(e) => e.target.src = 'https://via.placeholder.com/40'}
                />
                <span className="font-medium text-slate-700 flex-1">{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-400 text-xs">×{item.qty}</span>
                <span className="font-bold text-[#0B3C5D]">{formatCurrency(item.price * item.qty)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t-2 border-slate-200 flex justify-between items-center">
          <span className="font-bold text-slate-600">{t('Total')}</span>
          <span className="text-xl font-black text-[#0B3C5D]">{formatCurrency(tracking.total)}</span>
        </div>
      </div>

      {tracking.delivery && (
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
          <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
            <span>📬</span> {t('Delivery Address')}
          </h4>
          <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-600 space-y-1">
            <p className="font-bold text-slate-700">{tracking.delivery.fullName}</p>
            <p>{tracking.delivery.address}</p>
            <p>{tracking.delivery.city}, {tracking.delivery.state} - {tracking.delivery.pincode}</p>
            <p className="text-xs text-slate-400">📞 {tracking.delivery.phone}</p>
            {tracking.delivery.note && (
              <p className="text-xs text-slate-400 mt-1">📝 {t('Note:')} {tracking.delivery.note}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 justify-center">
        <Link to="/orders" className="bg-slate-100 text-slate-700 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-200 transition">
          ← {t('Back to Orders')}
        </Link>
        {tracking.currentStatus !== 'Delivered' && tracking.currentStatus !== 'Cancelled' && (
          <button 
            onClick={fetchOrderTracking}
            className="bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#07263b] transition flex items-center gap-2"
          >
            <span>🔄</span> {t('Refresh Status')}
          </button>
        )}
      </div>
    </div>
  );
};

// =============================================
// MAIN APP COMPONENT
// =============================================
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = useState(() => {
    const stored = localStorage.getItem('velqra_language');
    return LANGUAGE_OPTIONS.some(option => option.value === stored) ? stored : 'en';
  });
  const [currency, setCurrency] = useState(() => {
    const stored = localStorage.getItem('velqra_currency');
    return CURRENCY_OPTIONS.some(option => option.value === stored) ? stored : 'INR';
  });
  const [initialExchangeRates] = useState(getCachedExchangeRates);
  const [exchangeRates, setExchangeRates] = useState(initialExchangeRates.rates);
  const [exchangeRateDate, setExchangeRateDate] = useState(initialExchangeRates.date);
  const [exchangeRateStatus, setExchangeRateStatus] = useState('loading');
  const formatPrice = amount => formatMoney(amount, language, currency, exchangeRates);
  const t = (key, values) => translate(language, key, values);
  const localization = { language, currency, rates: exchangeRates, t, formatCurrency: formatPrice };
  const [products, setProducts] = useState(getCachedProducts);
  const [cart, setCart] = useState([]);
  const cartMutationQueue = useRef(Promise.resolve());
  const cartOpenRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isHeaderSearchOpen, setIsHeaderSearchOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState('');
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const [activeBanner, setActiveBanner] = useState(0);
  const banners = [banner1, banner2, banner3];

  useEffect(() => {
    captureTrafficAttribution(location.search, location.pathname);
  }, [location.pathname, location.search]);

  useEffect(() => {
    localStorage.setItem('velqra_language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('velqra_currency', currency);
  }, [currency]);

  useEffect(() => {
    let active = true;
    const loadExchangeRates = async () => {
      try {
        const quotes = CURRENCY_OPTIONS
          .filter(option => option.value !== 'INR')
          .map(option => option.value)
          .join(',');
        const response = await fetch(`${EXCHANGE_RATE_API_URL}?base=INR&quotes=${quotes}`);
        if (!response.ok) throw new Error('Exchange-rate request failed');

        const entries = await response.json();
        if (!Array.isArray(entries)) throw new Error('Invalid exchange-rate response');

        const nextRates = { INR: 1 };
        entries.forEach(entry => {
          if (CURRENCY_OPTIONS.some(option => option.value === entry.quote) &&
              Number.isFinite(Number(entry.rate)) && Number(entry.rate) > 0) {
            nextRates[entry.quote] = Number(entry.rate);
          }
        });

        if (!active) return;
        const hasMissingRates = CURRENCY_OPTIONS.some(option => !nextRates[option.value]);
        const latestDate = entries[0]?.date || '';
        setExchangeRates(nextRates);
        setExchangeRateDate(latestDate);
        setExchangeRateStatus(hasMissingRates ? 'partial' : 'ready');
        localStorage.setItem(EXCHANGE_RATES_CACHE_KEY, JSON.stringify({
          rates: nextRates,
          date: latestDate
        }));
      } catch {
        if (active) {
          const hasCachedForeignRates = Object.keys(initialExchangeRates.rates)
            .some(code => code !== 'INR');
          setExchangeRateStatus(hasCachedForeignRates ? 'stale' : 'error');
        }
      }
    };

    loadExchangeRates();
    const refreshTimer = window.setInterval(loadExchangeRates, 6 * 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  // Auth States
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    const user = getSessionUser();
    return sessionStorage.getItem('velqra_admin') === 'true' && user?.role === 'admin';
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const [isUserLoggedIn, setIsUserLoggedIn] = useState(() => {
    return Boolean(sessionStorage.getItem('velqra_user_token'));
  });
  const [currentUser, setCurrentUser] = useState(() => {
    return getSessionUser();
  });
  const [userAuthMode, setUserAuthMode] = useState('login');

  const openCart = () => {
    if (cartOpenRef.current) return;
    cartOpenRef.current = true;
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      state: { ...(location.state || {}), velqraCartOpen: true }
    });
    setIsCartOpen(true);
  };

  const closeCart = () => {
    if (!cartOpenRef.current) return;
    cartOpenRef.current = false;
    setIsCartOpen(false);
    setCheckoutOpen(false);
    if (location.state?.velqraCartOpen) navigate(-1);
  };

  useEffect(() => {
    const cartEntryIsOpen = Boolean(location.state?.velqraCartOpen);
    cartOpenRef.current = cartEntryIsOpen;
    setIsCartOpen(cartEntryIsOpen);
    if (!cartEntryIsOpen) setCheckoutOpen(false);
  }, [location.state]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setIsHeaderSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const syncUserAuthState = () => {
      setIsUserLoggedIn(Boolean(sessionStorage.getItem('velqra_user_token')));
      setCurrentUser(getSessionUser());
    };

    window.addEventListener('velqra-auth-change', syncUserAuthState);
    window.addEventListener('storage', syncUserAuthState);

    return () => {
      window.removeEventListener('velqra-auth-change', syncUserAuthState);
      window.removeEventListener('storage', syncUserAuthState);
    };
  }, []);

  useEffect(() => {
    ['velqra_user', 'velqra_user_token', 'velqra_token', 'velqra_admin', 'velqra_cart'].forEach(key => {
      localStorage.removeItem(key);
    });
  }, []);

  // Registration Fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regStep, setRegStep] = useState('form');
  const [regEmailOtp, setRegEmailOtp] = useState('');
  const [regSmsOtp, setRegSmsOtp] = useState('');
  const [regTimer, setRegTimer] = useState(0);
  const [regResendDisabled, setRegResendDisabled] = useState(false);

  // Login Fields
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobilePoliciesOpen, setIsMobilePoliciesOpen] = useState(false);
  const [isMobileSocialOpen, setIsMobileSocialOpen] = useState(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => {
    return false;
  });
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const isUserAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const openUserAuth = (mode = 'login') => {
    setError('');
    setUserAuthMode(mode);
    setIsAuthModalOpen(true);
    setIsForgotPasswordOpen(false);
    if (mode === 'register') setRegStep('form');
    navigate(mode === 'register' ? '/register' : '/login');
  };

  useEffect(() => {
    if (!isUserAuthPage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isUserAuthPage]);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [registeredPhoneLoading, setRegisteredPhoneLoading] = useState(false);
  const [isOrderOTPModalOpen, setIsOrderOTPModalOpen] = useState(false);
  const [pendingOrderData, setPendingOrderData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [deliveryForm, setDeliveryForm] = useState({
    fullName: '',
    phone: '',
    alternatePhone: '',
    email: '',
    address: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    note: ''
  });

  useEffect(() => {
    if (checkoutOpen) {
      const registeredPhone = getRegisteredPhone(currentUser);
      setDeliveryForm(prev => ({
        ...prev,
        phone: registeredPhone
      }));
    }
  }, [checkoutOpen, currentUser?.phone]);

  useEffect(() => {
    const token = sessionStorage.getItem('velqra_user_token');
    if (!checkoutOpen || !token || currentUser?.role === 'admin') return;

    let active = true;
    setRegisteredPhoneLoading(true);
    axios.get(`${AUTH_URL}/verify`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(({ data }) => {
      if (!active || !data.success) return;
      setCurrentUser(data.user);
      setDeliveryForm(prev => ({
        ...prev,
        phone: getRegisteredPhone(data.user)
      }));
      sessionStorage.setItem('velqra_user', JSON.stringify(data.user));
    }).catch(() => {
      if (active) showToast('Could not load your registered phone number. Please sign in again.', 'error');
    }).finally(() => {
      if (active) setRegisteredPhoneLoading(false);
    });

    return () => {
      active = false;
      setRegisteredPhoneLoading(false);
    };
  }, [checkoutOpen, currentUser?.role]);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Product Management States
  const [newProdName, setNewProdName] = useState('');
  const [newProdOriginalPrice, setNewProdOriginalPrice] = useState('');
  const [newProdDiscount, setNewProdDiscount] = useState('0');
  const [newProdCategory, setNewProdCategory] = useState('Face Wash');
  const [newProdIcon, setNewProdIcon] = useState('📦');
  const [newProdStock, setNewProdStock] = useState('10');
  const [newProdDescription, setNewProdDescription] = useState('');
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [newProdImageFile, setNewProdImageFile] = useState('');
  const [newProdPromoCode, setNewProdPromoCode] = useState('');
  const [newProdPromoDiscount, setNewProdPromoDiscount] = useState('');
  const [newProdImages, setNewProdImages] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdWeight, setNewProdWeight] = useState('');
  const [newProdWarranty, setNewProdWarranty] = useState('');
  const [newProdVideoUrl, setNewProdVideoUrl] = useState('');
  const [checkoutPromoCode, setCheckoutPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [newProdVideoType, setNewProdVideoType] = useState('youtube');
  const [newProdAttributes, setNewProdAttributes] = useState({});
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrValues, setNewAttrValues] = useState('');

  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminAuthMode, setAdminAuthMode] = useState('login');
  const [adminSetupStatus, setAdminSetupStatus] = useState(() =>
    localStorage.getItem(ADMIN_SETUP_CACHE_KEY) === 'true' ? 'complete' : 'loading'
  );
  const [adminPasswordChangeRequired, setAdminPasswordChangeRequired] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [adminSetupError, setAdminSetupError] = useState('');
  const isAdminLoginPath = location.pathname === '/admin/login';

  const loadAdminSetupStatus = async () => {
    const setupWasCompleted = localStorage.getItem(ADMIN_SETUP_CACHE_KEY) === 'true';
    if (!setupWasCompleted) setAdminSetupStatus('loading');
    try {
      const { data } = await axios.get(`${API_URL}/admin/setup-status`);
      if (!data.success || typeof data.ready !== 'boolean') {
        throw new Error('Invalid admin setup status response');
      }
      if (data.ready) {
        localStorage.setItem(ADMIN_SETUP_CACHE_KEY, 'true');
        setAdminSetupStatus('complete');
      } else {
        localStorage.removeItem(ADMIN_SETUP_CACHE_KEY);
        setAdminSetupStatus('required');
      }
    } catch {
      setAdminSetupStatus(setupWasCompleted ? 'complete' : 'error');
    }
  };

  useEffect(() => {
    loadAdminSetupStatus();
  }, []);

  useEffect(() => {
    if (isAdminLoginPath && !isAdminLoggedIn) {
      setAdminAuthMode('login');
      setShowAdminAuth(true);
    }
  }, [isAdminLoginPath, isAdminLoggedIn]);
  const [pendingPaymentOrders, setPendingPaymentOrders] = useState([]);

  useEffect(() => {
    const verifyAdminSession = async () => {
      const token = sessionStorage.getItem('velqra_token');
      if (!token) {
        setIsAdminLoggedIn(false);
        sessionStorage.removeItem('velqra_admin');
        return;
      }

      try {
        const res = await axios.get(`${AUTH_URL}/verify`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const isAdmin = res.data.success && res.data.user?.role === 'admin';
        setIsAdminLoggedIn(isAdmin);
        if (isAdmin) {
          sessionStorage.setItem('velqra_admin', 'true');
          sessionStorage.setItem('velqra_user', JSON.stringify(res.data.user));
          setCurrentUser(res.data.user);
        } else {
          sessionStorage.removeItem('velqra_admin');
        }
      } catch {
        setIsAdminLoggedIn(false);
        sessionStorage.removeItem('velqra_admin');
        sessionStorage.removeItem('velqra_token');
      }
    };

    verifyAdminSession();
  }, []);

  useEffect(() => {
    if (location.pathname !== '/') {
      setIsMobileMenuOpen(false);
      setIsMobilePoliciesOpen(false);
      setIsMobileSocialOpen(false);
    }
  }, [location.pathname]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const resetCheckout = () => {
    setCheckoutOpen(false);
    setPaymentMethod('cod');
    setMarketingConsent(false);
    setDeliveryForm({
      fullName: currentUser?.name || '',
      phone: getRegisteredPhone(currentUser),
      alternatePhone: '',
      email: currentUser?.email || '',
      address: '',
      landmark: '',
      city: '',
      state: '',
      pincode: '',
      note: ''
    });
  };

  // Registration OTP Timer
  useEffect(() => {
    let interval;
    if (regTimer > 0) {
      interval = setInterval(() => {
        setRegTimer(prev => prev - 1);
      }, 1000);
    } else {
      setRegResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [regTimer]);

  useEffect(() => {
    const handleScroll = () => setIsHeaderScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const bannerTimer = setInterval(() => {
      setActiveBanner((current) => (current + 1) % banners.length);
    }, 4000);
    return () => clearInterval(bannerTimer);
  }, [banners.length]);

  const startRegTimer = () => {
    setRegTimer(60);
    setRegResendDisabled(true);
  };

  const addAttribute = () => {
    if (!newAttrKey.trim()) {
      showToast('Please enter attribute name', 'error');
      return;
    }
    if (!newAttrValues.trim()) {
      showToast('Please enter attribute values (comma separated)', 'error');
      return;
    }

    const values = newAttrValues.split(',').map(v => v.trim()).filter(Boolean);
    if (values.length === 0) {
      showToast('Please enter at least one value', 'error');
      return;
    }

    setNewProdAttributes(prev => ({
      ...prev,
      [newAttrKey.trim()]: values
    }));

    setNewAttrKey('');
    setNewAttrValues('');
    showToast(`✅ Attribute "${newAttrKey.trim()}" added!`, 'success');
  };

  const removeAttribute = (key) => {
    setNewProdAttributes(prev => {
      const newAttrs = { ...prev };
      delete newAttrs[key];
      return newAttrs;
    });
  };

  const calculateDeliveryCharge = (subtotal) => {
    if (subtotal >= 199) return 0;
    return 20;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();

    const token = sessionStorage.getItem('velqra_user_token');
    if (!token) {
      showToast('Please login to place order', 'error');
      openUserAuth('login');
      return;
    }

    if (cart.length === 0) {
      showToast('Your cart is empty!', 'error');
      return;
    }

    const requiredFields = ['fullName', 'phone', 'address', 'city', 'state', 'pincode'];
    const missing = requiredFields.find(field => !String(deliveryForm[field]).trim());

    if (missing) {
      showToast(`Please fill ${missing.replace(/([A-Z])/g, ' $1').toLowerCase()}`, 'error');
      return;
    }

    if (paymentMethod === 'cod' && !deliveryForm.alternatePhone.trim()) {
      showToast('Enter an alternate phone number.', 'error');
      return;
    }

    const registeredPhone = getRegisteredPhone(currentUser);
    const deliveryPhone = String(deliveryForm.phone || '').replace(/\D/g, '').slice(-10);
    if (!registeredPhone || deliveryPhone !== registeredPhone) {
      showToast('Primary phone must match your registered mobile number.', 'error');
      return;
    }

    const orderStatus = paymentMethod === 'online' ? 'Payment Verification Pending' : 'Pending';
    const deliveryCharge = calculateDeliveryCharge(totalCartPrice);
    const promoDiscountAmount = appliedPromo
      ? Math.round(totalCartPrice * (appliedPromo.discount / 100))
      : 0;
    const finalTotal = Math.max(0, totalCartPrice - promoDiscountAmount) + deliveryCharge;

    const orderData = {
      items: cart.map(item => ({
        _id: item._id,
        name: item.name,
        price: item.price,
        qty: item.qty,
        image: item.image || item.imageUrl || '',
        originalPrice: item.originalPrice || 0,
        discountPercent: item.discountPercent || 0,
        category: item.category || '',
        selectedAttributes: item.selectedAttributes || {},
        promoApplied: item.promoApplied === true,
        promoCode: item.promoApplied ? item.promoCode : ''
      })),
      total: finalTotal,
      paymentMethod: paymentMethod,
      attribution: getTrafficAttribution(marketingConsent),
      marketingConsent,
      status: orderStatus,
      delivery: {
        fullName: deliveryForm.fullName,
        phone: deliveryForm.phone,
        alternatePhone: deliveryForm.alternatePhone,
        email: deliveryForm.email || currentUser?.email || '',
        address: deliveryForm.address,
        landmark: deliveryForm.landmark || '',
        city: deliveryForm.city,
        state: deliveryForm.state,
        pincode: deliveryForm.pincode,
        note: deliveryForm.note || ''
      }
    };

        // ✅ Online payment — OTP skip, direct PayU redirect
    if (paymentMethod === 'online') {
      try {
        setPlacingOrder(true);
        const token = sessionStorage.getItem('velqra_user_token');

        // 1. Order create karo (no OTP token needed)
        const response = await axios.post(
          `${API_URL}/orders`,
          { ...orderData, skipOTP: true },   // 👈 skipOTP flag backend ke liye
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (!response.data.success) {
          showToast(response.data.message || 'Failed to place order', 'error');
          setPlacingOrder(false);
          return;
        }

        const orderId = response.data.order._id;

        // 2. Cart clear karo
        setCart([]);
        closeCart();
        resetCheckout();
        fetchOrders();

        // 3. PayU redirect
        showToast('🔒 Redirecting to PayU secure payment...', 'info');
        const payuRes = await axios.post(
          `${API_URL}/payment/payu/initiate`,
          { orderId },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!payuRes.data.success) {
          showToast('Payment initiation failed. Check My Orders.', 'error');
          setTimeout(() => navigate('/orders'), 1500);
          return;
        }

        const { paymentUrl, params } = payuRes.data;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = getPayUPaymentUrl(paymentUrl);
        Object.entries(params).forEach(([k, v]) => {
          const inp = document.createElement('input');
          inp.type = 'hidden';
          inp.name = k;
          inp.value = v;
          form.appendChild(inp);
        });
        document.body.appendChild(form);
        form.submit();
        return;
      } catch (err) {
        showToast(err.response?.data?.message || 'Failed to place order. Please try again.', 'error');
        setPlacingOrder(false);
        return;
      }
    }

    // ✅ COD — OTP modal open karo (existing flow)
    setPendingOrderData({
      orderData,
      finalTotal,
      deliveryCharge,
      cartSnapshot: [...cart]
    });
    setIsOrderOTPModalOpen(true);
  };

    // 🆕 OTP verify hone ke baad actual order place + PayU redirect
  const handleVerifyOrderOTP = async (orderConfirmToken) => {
    if (!pendingOrderData) {
      showToast('Missing order data', 'error');
      setIsOrderOTPModalOpen(false);
      return;
    }
    const { orderData, finalTotal, deliveryCharge, cartSnapshot } = pendingOrderData;

    try {
      setPlacingOrder(true);
      const token = sessionStorage.getItem('velqra_user_token');
      const response = await axios.post(
        `${API_URL}/orders`,
        { ...orderData, orderConfirmToken },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        const orderId = response.data.order._id;

        setCart([]);
        closeCart();
        setIsOrderOTPModalOpen(false);
        setPendingOrderData(null);
        resetCheckout();
        fetchOrders();

        if (paymentMethod === 'online') {
          showToast('🔒 Redirecting to PayU secure payment...', 'info');
          try {
            const payuRes = await axios.post(
              `${API_URL}/payment/payu/initiate`,
              { orderId },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!payuRes.data.success) {
              showToast('Payment initiation failed. Order placed — check My Orders.', 'error');
              setTimeout(() => navigate('/orders'), 1500);
              return;
            }

            const { paymentUrl, params } = payuRes.data;

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = getPayUPaymentUrl(paymentUrl);
            Object.entries(params).forEach(([k, v]) => {
              const inp = document.createElement('input');
              inp.type = 'hidden';
              inp.name = k;
              inp.value = v;
              form.appendChild(inp);
            });
            document.body.appendChild(form);
            form.submit();
            return;
          } catch (payuErr) {
            showToast('Payment could not be initiated. Check My Orders.', 'error');
            setTimeout(() => navigate('/orders'), 2000);
            return;
          }
        } else {
          showToast('✅ Order placed successfully! Cash on delivery selected.', 'success');
        }

        setTimeout(() => {
          navigate('/orders');
        }, 2000);
      } else {
        showToast(response.data.message || 'Failed to place order', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to place order. Please try again.', 'error');
    } finally {
      setPlacingOrder(false);
    }
  };


  const handleVerifyPayment = async (orderId) => {
    const token = sessionStorage.getItem('velqra_user_token');
    if (!token) {
      showToast('Please login', 'error');
      return;
    }

    try {
      const response = await axios.patch(
        `${API_URL}/orders/${orderId}/verify-payment`,
        { status: 'Payment Verified' },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        showToast('✅ Payment verified successfully!', 'success');
        fetchOrders();
        setPendingPaymentOrders(prev => prev.filter(id => id !== orderId));
      } else {
        showToast(response.data.message || 'Failed to verify payment', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to verify payment', 'error');
    }
  };

  const fetchProducts = async () => {
    const cachedProducts = getCachedProducts();
    setLoading(cachedProducts.length === 0);
    try {
      if (!isSupabaseConfigured) {
        showToast('Add Supabase URL and anon key to load products', 'error');
        return;
      }
      const { data, error } = await supabase
        .from('products')
        .select('*');

      if (error) throw error;

      const productsData = (data || []).map(normalizeProduct);
      setProducts(productsData);
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(productsData));
    } catch (err) {
      showToast('Failed to load products from Supabase', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminSetupStatus === 'complete') fetchProducts();
  }, [adminSetupStatus]);

  const syncGuestCart = async (token, user) => {
    if (!token || !user || user.role === 'admin' || cart.length === 0) return;

    try {
      const { data: currentCart } = await axios.get(`${API_URL}/cart`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const existingItems = normalizeCart(currentCart.cart?.items || []);
      const mergedItems = [...existingItems];

      cart.forEach(item => {
        const key = getCartItemKey(item);
        const existing = mergedItems.find(candidate => getCartItemKey(candidate) === key);
        if (existing) {
          existing.qty = Math.min(existing.stock || item.stock, existing.qty + item.qty);
        } else {
          mergedItems.push(item);
        }
      });

      const { data } = await axios.post(`${API_URL}/cart/sync`, {
        items: mergedItems.map(item => ({
          _id: item._id,
          qty: item.qty,
          selectedAttributes: item.selectedAttributes || {},
          promoCode: item.promoApplied ? item.promoCode : ''
        }))
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!data.success) throw new Error(data.message || 'Unable to save cart');
      setCart(normalizeCart(data.cart?.items || []));
    } catch (cartError) {
      showToast('Your account was signed in, but the cart could not be synced.', 'error');
    }
  };

  const queueCartMutation = (operation) => {
    cartMutationQueue.current = cartMutationQueue.current.then(operation, operation);
    return cartMutationQueue.current;
  };

  useEffect(() => {
    const token = sessionStorage.getItem('velqra_user_token');
    if (currentUser?.role === 'admin') {
      setCart([]);
      setCartLoading(false);
      return;
    }
    if (!isUserLoggedIn || !token) {
      setCart([]);
      setCartLoading(false);
      return;
    }

    let active = true;
    setCartLoading(true);
    axios.get(`${API_URL}/cart`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(({ data }) => {
      if (active && data.success) setCart(normalizeCart(data.cart?.items || []));
    }).catch(cartError => {
      if (!active) return;
      showToast('Unable to load your saved cart.', 'error');
    }).finally(() => {
      if (active) setCartLoading(false);
    });

    return () => { active = false; };
  }, [isUserLoggedIn, currentUser?.role]);

  const fetchOrders = async () => {
    const token = sessionStorage.getItem('velqra_user_token');
    if (!token) return;

    setOrdersLoading(true);
    try {
      const res = await axios.get(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setOrders(res.data.orders || []);
        const pending = res.data.orders
          .filter(order => order.status === 'Payment Verification Pending' && order.paymentMethod === 'online')
          .map(order => order._id);
        setPendingPaymentOrders(pending);
      }
    } catch (err) {
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (isUserLoggedIn) {
      fetchOrders();
    }
  }, [isUserLoggedIn]);

  useEffect(() => {
    setDeliveryForm(prev => ({
      ...prev,
      fullName: currentUser?.name || prev.fullName || '',
      email: currentUser?.email || prev.email || ''
    }));
  }, [currentUser?.name, currentUser?.email]);

  useEffect(() => {
    if (location.pathname === '/login' || location.pathname === '/register') {
      setUserAuthMode(location.pathname === '/register' ? 'register' : 'login');
      setIsAuthModalOpen(true);
    } else {
      setIsAuthModalOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode');
    if (mode === 'login' || mode === 'register') {
      openUserAuth(mode);
    }
  }, [location.search]);

  useEffect(() => {
    const handler = (event) => {
      addToCart(event.detail);
    };
    window.addEventListener('addToCart', handler);
    return () => window.removeEventListener('addToCart', handler);
  }, []);

  // Register - Step 1: Send OTP
    const handleSendRegistrationOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (regPassword.length < 8 || regPassword.length > 72) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    const normalizedEmail = regEmail.trim().toLowerCase();
    if (!isValidGmailAddress(normalizedEmail)) {
      setError('Enter a valid Gmail address ending in @gmail.com');
      setLoading(false);
      return;
    }

    const normalizedPhone = String(regPhone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      setError('Please enter a valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(`${AUTH_URL}/register`, {
        name: regName,
        email: normalizedEmail,
        phone: normalizedPhone,
        password: regPassword,
        confirmPassword: regConfirmPassword
      });

      if (res.data.success) {
        setRegStep('otp');
        startRegTimer();
        // 🧪 Test mode: OTP response mein aa jayega
        if (res.data.emailOtp || res.data.smsOtp) {
          setRegEmailOtp(res.data.emailOtp || '');
          setRegSmsOtp(res.data.smsOtp || '');
          showToast('🧪 Local test mode: verification codes auto-filled.', 'info');
        } else {
          showToast('✅ Verification codes sent to your email and mobile!', 'success');
        }
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

    // Register - Step 2: Verify OTP (SMS only)
  const handleVerifyRegistrationOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (regEmailOtp.length !== 6 || regSmsOtp.length !== 6) {
      setError('Enter both 6-digit verification codes');
      setLoading(false);
      return;
    }

    try {
      const normalizedPhone = String(regPhone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      const res = await axios.post(`${AUTH_URL}/verify-registration`, {
        phone: normalizedPhone,
        emailOtp: regEmailOtp.trim(),
        smsOtp: regSmsOtp.trim()
      });

      if (res.data.success) {
        const userData = res.data.user;
        const token = res.data.token;
        await syncGuestCart(token, userData);
        setCurrentUser(userData);
        setIsUserLoggedIn(true);
        sessionStorage.setItem('velqra_user', JSON.stringify(userData));
        sessionStorage.setItem('velqra_user_token', token);
        window.dispatchEvent(new Event('velqra-auth-change'));
        setRegStep('success');
        setIsAuthModalOpen(false);
        navigate('/');
        showToast('✅ Registration completed successfully!', 'success');

        setRegName('');
        setRegEmail('');
        setRegPhone('');
        setRegPassword('');
        setRegConfirmPassword('');
        setRegEmailOtp('');
        setRegSmsOtp('');
        setRegStep('form');
        setUserAuthMode('login');
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  // Resend Registration OTP
    // Resend Registration OTP (SMS only)
  const handleResendRegistrationOTP = async () => {
    setLoading(true);
    setError('');

    try {
      const normalizedPhone = String(regPhone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      const res = await axios.post(`${AUTH_URL}/resend-registration-otp`, {
        phone: normalizedPhone
      });

      if (res.data.success) {
        startRegTimer();
        if (res.data.emailOtp || res.data.smsOtp) {
          setRegEmailOtp(res.data.emailOtp || '');
          setRegSmsOtp(res.data.smsOtp || '');
          showToast('🧪 Local test mode: verification codes auto-filled.', 'info');
        } else {
          showToast('✅ Verification codes resent!', 'success');
        }
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // User Login
  const handleUserLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await axios.post(`${AUTH_URL}/login`, {
        email: userEmail.trim(),
        password: userPassword
      });

      if (res.data.success) {
        const userData = res.data.user;
        await syncGuestCart(res.data.token, userData);
        setCurrentUser(userData);
        setIsUserLoggedIn(true);
        sessionStorage.setItem('velqra_user', JSON.stringify(userData));
        sessionStorage.setItem('velqra_user_token', res.data.token);
        window.dispatchEvent(new Event('velqra-auth-change'));
        if (userData.role === 'admin') {
          setIsAdminLoggedIn(true);
          sessionStorage.setItem('velqra_admin', 'true');
          sessionStorage.setItem('velqra_token', res.data.token);
          navigate('/admin');
        } else {
          navigate('/');
        }
        setUserEmail('');
        setUserPassword('');
        setIsAuthModalOpen(false);
        showToast('✅ Login successful!', 'success');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Login failed. Please try again.';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUserLogout = () => {
    setIsUserLoggedIn(false);
    setCurrentUser(null);
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem('velqra_user');
    sessionStorage.removeItem('velqra_user_token');
    sessionStorage.removeItem('velqra_token');
    sessionStorage.removeItem('velqra_admin');
    window.dispatchEvent(new Event('velqra-auth-change'));
    showToast('👋 Logged out', 'info');
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAdminSetupError('');
    try {
      const res = await axios.post(`${AUTH_URL}/login`, { username: 'admin', password: loginPassword });
      if (res.data.success) {
        const userRole = res.data.user?.role;
        if (userRole !== 'admin') {
          setAdminSetupError('This account is not an admin account.');
          setLoading(false);
          return;
        }

        setIsAdminLoggedIn(true);
        await syncGuestCart(res.data.token, res.data.user);
        sessionStorage.setItem('velqra_admin', 'true');
        sessionStorage.setItem('velqra_token', res.data.token);
        sessionStorage.setItem('velqra_user', JSON.stringify(res.data.user));
        sessionStorage.setItem('velqra_user_token', res.data.token);
        window.dispatchEvent(new Event('velqra-auth-change'));
        setCurrentUser(res.data.user);
        setIsUserLoggedIn(true);
        setShowAdminAuth(false);
        setLoginPassword('');
        setAdminPasswordChangeRequired(Boolean(res.data.mustChangePassword));
        setAdminSetupStatus(res.data.mustChangePassword ? 'required' : 'complete');
        if (!res.data.mustChangePassword) {
          localStorage.setItem(ADMIN_SETUP_CACHE_KEY, 'true');
          navigate('/admin');
          showToast('🚀 Welcome Admin!', 'success');
        } else {
          localStorage.removeItem(ADMIN_SETUP_CACHE_KEY);
        }
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      setAdminSetupError(message);
      if (adminSetupStatus === 'complete') showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminPasswordChange = async (e) => {
    e.preventDefault();
    setAdminSetupError('');
    if (newAdminPassword !== confirmAdminPassword) {
      setAdminSetupError('Passwords do not match.');
      return;
    }
    if (newAdminPassword.length < 12) {
      setAdminSetupError('Use a password with at least 12 characters.');
      return;
    }

    setLoading(true);
    try {
      const token = sessionStorage.getItem('velqra_token');
      await axios.put(`${API_URL}/admin/password`, { newPassword: newAdminPassword }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewAdminPassword('');
      setConfirmAdminPassword('');
      setAdminPasswordChangeRequired(false);
      setAdminSetupStatus('complete');
      localStorage.setItem(ADMIN_SETUP_CACHE_KEY, 'true');
      navigate('/admin');
      showToast('Admin password updated. The storefront is now available.', 'success');
    } catch (err) {
      setAdminSetupError(err.response?.data?.message || 'Could not update the admin password.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${AUTH_URL}/register`, {
        name: registerName,
        email: registerEmail,
        password: registerPassword
      });
      if (res.data.success) {
        showToast('✅ Admin registration successful! Please login.', 'success');
        setAdminAuthMode('login');
        setRegisterName('');
        setRegisterEmail('');
        setRegisterPassword('');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    sessionStorage.removeItem('velqra_admin');
    sessionStorage.removeItem('velqra_token');
    sessionStorage.removeItem('velqra_user');
    sessionStorage.removeItem('velqra_user_token');
    setCurrentUser(null);
    setIsUserLoggedIn(false);
    setCart([]);
    window.dispatchEvent(new Event('velqra-auth-change'));
    showToast('👋 Admin Logged out', 'info');
    navigate('/', { replace: true });
  };

  const handleOrderStatusChange = async (orderId, status) => {
    const token = sessionStorage.getItem('velqra_user_token');
    try {
      const res = await axios.patch(`${API_URL}/orders/${orderId}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setOrders(prev => prev.map(order => order._id === orderId ? res.data.order : order));
        showToast('✅ Order status updated', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  // Add Product
  const handleProductImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be 5 MB or less', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setNewProdImageFile(reader.result);
      setNewProdImageUrl(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!newProdName || !newProdOriginalPrice || !newProdImageUrl) {
      showToast('Name, Price and Image URL are required!', 'error');
      return;
    }
    const promoCode = newProdPromoCode.trim().toUpperCase();
    const promoDiscount = Number(newProdPromoDiscount) || 0;
    if ((promoCode && (promoDiscount <= 0 || promoDiscount > 100)) ||
      (!promoCode && promoDiscount > 0)) {
      showToast('Enter both a promo code and a discount between 1% and 100%.', 'error');
      return;
    }

    const productData = {
      name: newProdName,
      originalPrice: parseFloat(newProdOriginalPrice),
      discountPercent: parseFloat(newProdDiscount) || 0,
      category: newProdCategory,
      icon: newProdIcon,
      stock: parseInt(newProdStock) || 10,
      description: newProdDescription,
      brand: newProdBrand,
      weight: newProdWeight || null,
      warranty: newProdWarranty || '',
      imageUrl: newProdImageUrl.trim(),
      images: newProdImages ? newProdImages.split(',').map(img => img.trim()) : [newProdImageUrl.trim()],
      videoUrl: newProdVideoUrl.trim() || '',
      videoType: newProdVideoType || 'youtube',
      attributes: newProdAttributes,
      promoCode,
      promoDiscount
    };

    setLoading(true);
    try {
      const token = sessionStorage.getItem('velqra_token');
      const res = await axios.post(`${API_URL}/products/add`, productData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.success) {
        const savedProduct = { ...res.data.product, _id: res.data.product._id || res.data.product.id };
        setProducts(currentProducts => {
          const updatedProducts = [savedProduct, ...currentProducts];
          localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(updatedProducts));
          return updatedProducts;
        });
        setNewProdName('');
        setNewProdOriginalPrice('');
        setNewProdDiscount('0');
        setNewProdStock('10');
        setNewProdDescription('');
        setNewProdImageUrl('');
        setNewProdImageFile('');
        setNewProdImages('');
        setNewProdBrand('');
        setNewProdWeight('');
        setNewProdWarranty('');
        setNewProdVideoUrl('');
        setNewProdVideoType('youtube');
        setNewProdAttributes({});
        setNewProdPromoCode('');
        setNewProdPromoDiscount('');
        setNewAttrKey('');
        setNewAttrValues('');
        showToast('✅ Product added successfully!', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add product', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Delete this product?')) {
      setLoading(true);
      try {
        const token = sessionStorage.getItem('velqra_token');
        await axios.delete(`${API_URL}/products/delete/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setProducts(currentProducts => {
          const updatedProducts = currentProducts.filter(p => p._id !== id);
          localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(updatedProducts));
          return updatedProducts;
        });
        setCart(cart.filter(item => item._id !== id));
        showToast('🗑️ Product deleted', 'success');
      } catch (err) {
        showToast('Failed to delete', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const addToCart = async (product) => {
    const stock = Number(product.stock);
    if (!Number.isFinite(stock) || stock <= 0) {
      showToast('Out of stock!', 'error');
      return false;
    }

    const token = sessionStorage.getItem('velqra_user_token');
    if (token && currentUser?.role !== 'admin') {
      setCartLoading(true);
      try {
        await queueCartMutation(async () => {
          const { data } = await axios.post(`${API_URL}/cart/add`, {
            productId: product._id,
            qty: 1,
            selectedAttributes: product.selectedAttributes || {},
            promoCode: product.promoApplied ? product.promoCode : ''
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!data.success) throw new Error(data.message || 'Unable to add product to cart');
          setCart(normalizeCart(data.cart?.items || []));
        });
        showToast('✅ Added to your saved cart', 'success');
        return true;
      } catch (cartError) {
        showToast(cartError.response?.data?.message || 'Could not add product to cart', 'error');
        return false;
      } finally {
        setCartLoading(false);
      }
    }

    const productKey = getCartItemKey(product);
    const productQuantity = cart
      .filter(item => String(item._id) === String(product._id))
      .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    if (productQuantity >= stock) {
      showToast('Not enough stock', 'error');
      return false;
    }

    setCart(prev => {
      const current = prev.find(item => getCartItemKey(item) === productKey);
      if (current) {
        return prev.map(item => getCartItemKey(item) === productKey
          ? { ...item, qty: item.qty + 1 }
          : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    showToast('✅ Added to cart', 'success');
    return true;
  };

  const updateQty = (cartItem, change) => {
    const token = sessionStorage.getItem('velqra_user_token');
    if (token && currentUser?.role !== 'admin') {
      queueCartMutation(async () => {
        const { data: current } = await axios.get(`${API_URL}/cart`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const currentItem = normalizeCart(current.cart?.items || []).find(item =>
          getCartItemKey(item) === getCartItemKey(cartItem)
        );
        if (!currentItem) return;
        const qty = Math.max(0, currentItem.qty + change);
        if (qty > currentItem.stock) {
          showToast('Not enough stock', 'error');
          return;
        }
        const { data } = await axios.put(`${API_URL}/cart/update/${cartItem._id}`, {
          qty,
          selectedAttributes: currentItem.selectedAttributes || {},
          promoCode: currentItem.promoCode || ''
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!data.success) throw new Error(data.message || 'Unable to update cart');
        setCart(normalizeCart(data.cart?.items || []));
      }).catch(cartError => {
        showToast(cartError.response?.data?.message || 'Could not update cart', 'error');
      });
      return;
    }

    setCart(prev =>
      prev.map(item => {
        if (getCartItemKey(item) === getCartItemKey(cartItem)) {
          const newQty = item.qty + change;
          const otherProductQty = prev
            .filter(candidate => String(candidate._id) === String(cartItem._id) &&
              getCartItemKey(candidate) !== getCartItemKey(cartItem))
            .reduce((sum, candidate) => sum + (Number(candidate.qty) || 0), 0);
          if (change > 0 && newQty + otherProductQty > item.stock) {
            showToast('Not enough stock', 'error');
            return item;
          }
          return newQty > 0 ? { ...item, qty: newQty } : null;
        }
        return item;
      }).filter(Boolean)
    );
  };

  const categories = [...new Set(
    (Array.isArray(products) ? products : [])
      .map(product => String(product?.category || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const selectedCurrencyRate = currency === 'INR' ? 1 : Number(exchangeRates[currency]);
  const selectedCurrencyAvailable = Number.isFinite(selectedCurrencyRate) && selectedCurrencyRate > 0;
  const filteredProducts = (Array.isArray(products) ? products : []).filter(product => {
    const searchableText = [product?.name, product?.category, product?.brand]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchSearch = searchableText.includes(normalizedSearch);
    const categoryKey = String(product?.category || '').toLowerCase().replace(/[\s_-]+/g, '');
    const matchCategory = activeCategory === 'All' || categoryKey === 'facewash';
    return matchSearch && matchCategory;
  });

  const totalCartItems = cart.reduce((sum, item) => sum + item.qty, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalSavings = cart.reduce((sum, item) => {
    return sum + ((item.originalPrice - item.price) * item.qty);
  }, 0);

  const deliveryCharge = calculateDeliveryCharge(totalCartPrice);
  const promoDiscountAmount = appliedPromo
    ? Math.round(totalCartPrice * (appliedPromo.discount / 100))
    : 0;
  const grandTotal = Math.max(0, totalCartPrice - promoDiscountAmount) + deliveryCharge;

  if (adminSetupStatus !== 'complete') {
    const changingPassword = adminPasswordChangeRequired;

    return (
      <main className="min-h-screen bg-[#f1f1ef] px-4 py-10 text-slate-900 flex items-center justify-center">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
          <div className="mb-6 text-center">
            <img src={velqraLogo} alt="VELQRA" className="mx-auto mb-5 h-12 w-auto object-contain" />
            <h1 className="text-xl font-black text-[#173b32]">
              {adminSetupStatus === 'loading'
                ? 'Checking store setup...'
                : adminSetupStatus === 'error'
                  ? 'Store setup unavailable'
                  : changingPassword
                    ? 'Set a new admin password'
                    : 'Admin setup required'}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {adminSetupStatus === 'loading'
                ? 'Please wait.'
                : adminSetupStatus === 'error'
                  ? 'The store cannot open until the admin setup service is reachable.'
                  : changingPassword
                    ? 'Choose a new password to unlock the storefront.'
                    : 'Sign in as the admin and change the initial password before the storefront opens.'}
            </p>
          </div>

          {adminSetupStatus === 'error' ? (
            <button
              type="button"
              onClick={loadAdminSetupStatus}
              className="w-full rounded-xl bg-[#173b32] py-3 text-sm font-bold text-white"
            >
              Retry
            </button>
          ) : adminSetupStatus === 'loading' ? (
            <div className="py-4 text-center text-sm text-slate-500">Loading...</div>
          ) : changingPassword ? (
            <form onSubmit={handleAdminPasswordChange} className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                  value={newAdminPassword}
                  onChange={event => setNewAdminPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm normal-case tracking-normal text-slate-900"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                  value={confirmAdminPassword}
                  onChange={event => setConfirmAdminPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm normal-case tracking-normal text-slate-900"
                />
              </label>
              {adminSetupError && <p role="alert" className="text-sm text-red-600">{adminSetupError}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#173b32] py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save new password'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Username
                <input
                  type="text"
                  autoComplete="username"
                  value="admin"
                  readOnly
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700"
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={event => setLoginPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900"
                />
              </label>
              {adminSetupError && <p role="alert" className="text-sm text-red-600">{adminSetupError}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#173b32] py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Admin sign in'}
              </button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <LocalizationContext.Provider value={localization}>
    <div className="velqra-storefront min-h-screen text-neutral-100 font-sans antialiased flex flex-col">

      {toast.show && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white font-bold text-sm transition-all ${
          toast.type === 'success' ? 'bg-green-500' :
          toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {toast.message}
        </div>
      )}

      {!isUserAuthPage && (
      <>
      <div className="announcement-bar" role="region" aria-label="VELQRA announcement">
        <div className="announcement-track">
          {Array.from({ length: 2 }).map((_, copy) => (
            <div key={copy} className="announcement-content" aria-hidden={copy === 1}>
              <span>START SHOPPING WITH VELQRA</span>
              <span className="announcement-star">✦</span>
              <strong>BUY NOW</strong>
              <span className="announcement-star">✦</span>
              <span>PREMIUM QUALITY. EVERYDAY VALUE.</span>
              <span className="announcement-star">✦</span>
            </div>
          ))}
        </div>
        <div className="announcement-socials">
          <a href="https://www.instagram.com/officialvelqra" target="_blank" rel="noreferrer" aria-label="VELQRA on Instagram" title="Instagram @officialvelqra">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
            </svg>
          </a>
          <a href="https://www.facebook.com/officialvelqra" target="_blank" rel="noreferrer" aria-label="VELQRA on Facebook" title="Facebook @officialvelqra">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.2-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.6v3h2.7v8h3.4z" />
            </svg>
          </a>
          <a href="https://www.youtube.com/@officialvelqra" target="_blank" rel="noreferrer" aria-label="VELQRA on YouTube" title="YouTube @officialvelqra">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
            </svg>
          </a>
        </div>
      </div>
      <header className="velqra-main-header sticky top-[30px] z-[70] flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 shadow-sm backdrop-blur-md sm:px-6 sm:py-4">
        <div className={`flex items-center gap-3 sm:gap-5 ${location.pathname === '/' ? 'pl-12 sm:pl-0' : ''}`}>
          {location.pathname !== '/' && (
            <button type="button" onClick={() => navigate(-1)} className="grid h-9 w-9 place-items-center text-neutral-900" aria-label="Go back">
              <svg className="h-7 w-7 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <Link to="/" className="flex items-center gap-2" aria-label="VELQRA home">
            <img src={velqraLogo} alt="" className="header-brand-image" />
            <span className="font-serif text-xl font-bold tracking-[0.08em] text-[#173b32] sm:text-2xl" aria-label="VELQRA">
              VELQRA<sup className="ml-0.5 text-[8px] font-normal text-[#d4af37]">™</sup>
            </span>
          </Link>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {isUserLoggedIn ? (
            <div className="flex items-center gap-2">
              <span className="max-w-28 truncate text-xs font-bold uppercase tracking-wide text-neutral-700 sm:max-w-40">
                {currentUser?.name || currentUser?.email || 'Account'}
              </span>
              <button
                type="button"
                onClick={isAdminLoggedIn ? handleAdminLogout : handleUserLogout}
                className="velqra-header-login inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-neutral-800 sm:px-4"
              >
                {t('Logout').toUpperCase()}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openUserAuth('login')}
              className="velqra-header-login inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-neutral-800 sm:px-4"
            >
              {t('Login').toUpperCase()}
            </button>
          )}
          {isUserLoggedIn && orders.length > 0 ? (
            <Link to="/orders" className="text-xs font-bold uppercase tracking-wide text-neutral-700">{t('Orders')}</Link>
          ) : null}
          {totalCartItems > 0 && (
            <button
              type="button"
              onClick={openCart}
              className="hidden text-xs font-bold uppercase tracking-wide text-[#173b32] sm:inline"
            >
              {t('ORDER')}
            </button>
          )}
          <button
            onClick={openCart}
            className="relative flex items-center gap-2 bg-neutral-900 border border-neutral-700 px-4 py-2 rounded-full hover:border-amber-400 transition"
            aria-label="Open shopping bag"
          >
            <svg className="w-5 h-5 stroke-current text-amber-400 fill-none" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <span className="text-sm font-medium">{t('BAG').toUpperCase()}</span>
            {totalCartItems > 0 && (
              <span className="bg-amber-400 text-black text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalCartItems}
              </span>
            )}
          </button>
          <LocaleControls
            language={language}
            currency={currency}
            onLanguageChange={setLanguage}
            onCurrencyChange={setCurrency}
          />
        </div>

        {location.pathname === '/' && (
          <button
            type="button"
            onClick={() => {
              setIsHeaderSearchOpen(open => !open);
              setIsMobileMenuOpen(false);
            }}
            aria-label={t(isHeaderSearchOpen ? 'Close search' : 'Search products')}
            aria-expanded={isHeaderSearchOpen}
            aria-controls="header-catalog-search"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-800 transition hover:border-[#173b32] hover:text-[#173b32] focus:outline-none focus:ring-2 focus:ring-[#173b32]"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path strokeLinecap="round" d="m16 16 4.5 4.5" />
            </svg>
          </button>
        )}

        {location.pathname === '/' && (
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="absolute left-3 top-3 z-[45] grid h-10 w-10 place-items-center rounded-full border border-neutral-300 bg-white text-neutral-900 md:hidden"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="h-5 w-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        )}

        {location.pathname === '/' && isMobileMenuOpen && (
          <>
            <nav
              className="velqra-mobile-nav absolute left-[-12px] right-[-12px] top-full z-[42] flex flex-col bg-[#fdfcf9] md:hidden"
              style={{ backgroundColor: '#fdfcf9', color: '#173b32' }}
              aria-label="Mobile navigation"
            >
              <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#d9d8d2] px-6">
                <span className="text-2xl font-semibold tracking-[0.08em] text-[#173b32]">{t('MENU')}</span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="grid h-10 w-10 place-items-center text-[#173b32]"
                  aria-label="Close navigation menu"
                >
                  <svg className="h-8 w-8 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
                {[
                  [t('Shop'), '/'],
                  [t('Face Wash'), '/#products'],
                  [t('Orders'), '/orders']
                ].map(([label, to]) => (
                  <Link
                    key={label}
                    to={to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block border-b border-[#e1e0da] py-[18px] text-xl font-medium leading-tight text-[#173b32]"
                  >
                    {label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openCart();
                  }}
                  className="block w-full border-b border-[#e1e0da] py-[18px] text-left text-xl font-medium leading-tight text-[#173b32]"
                >
                  {t('Cart')}{totalCartItems > 0 ? ` (${totalCartItems})` : ''}
                </button>
                <div className="pt-5">
                  <button
                    type="button"
                    onClick={() => setIsMobilePoliciesOpen((open) => !open)}
                    className="flex w-full items-center justify-between border-b border-[#e1e0da] py-[18px] text-left text-xl font-medium leading-tight text-[#173b32]"
                    aria-expanded={isMobilePoliciesOpen}
                  >
                    Privacy
                    <span className="text-base">{isMobilePoliciesOpen ? '−' : '+'}</span>
                  </button>
                  {isMobilePoliciesOpen && (
                    <div className="flex flex-col py-2 text-xs text-[#777b74]">
                      {[
                        ['Shipping Policy', '/shipping-policy'],
                        ['Privacy Policy', '/privacy-policy'],
                        ['Terms & Conditions', '/terms-policy'],
                        ['Return & Refund Policy', '/return-refund-policy'],
                        ['Contact Policy', '/contact-policy']
                      ].map(([label, to]) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => {
                            setIsMobilePoliciesOpen(false);
                            setIsMobileMenuOpen(false);
                          }}
                          className="border-b border-[#eeeae2] py-3"
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  to="/contact-policy"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block border-b border-[#e1e0da] py-[18px] text-xl font-medium leading-tight text-[#173b32]"
                >
                  Support Team
                </Link>
                <div>
                  <button
                    type="button"
                    onClick={() => setIsMobileSocialOpen((open) => !open)}
                    className="flex w-full items-center justify-between border-b border-[#e1e0da] py-[18px] text-left text-xl font-medium text-[#173b32]"
                    aria-expanded={isMobileSocialOpen}
                  >
                    Social Contact
                    <span className="text-base">{isMobileSocialOpen ? '−' : '+'}</span>
                  </button>
                  {isMobileSocialOpen && (
                    <div className="flex flex-col text-sm text-[#777b74]">
                      <a href="https://www.youtube.com/@officialvelqra" target="_blank" rel="noreferrer" className="border-b border-[#eeeae2] py-3">YouTube</a>
                      <a href="https://www.instagram.com" target="_blank" rel="noreferrer" className="border-b border-[#eeeae2] py-3">Instagram</a>
                      <a href="https://www.facebook.com" target="_blank" rel="noreferrer" className="border-b border-[#eeeae2] py-3">Facebook</a>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    if (isUserLoggedIn) {
                      if (isAdminLoggedIn) {
                        handleAdminLogout();
                      } else {
                        handleUserLogout();
                      }
                    } else {
                      openUserAuth('login');
                    }
                  }}
                  className="block w-full border-b border-[#e1e0da] py-[18px] text-left text-xl font-medium leading-tight text-[#173b32]"
                >
                  {t(isUserLoggedIn ? 'Logout' : 'Login')}
                </button>
              </div>
            </nav>
          </>
        )}

        {location.pathname === '/' && (
          <div
            id="header-catalog-search"
            className={`${isHeaderSearchOpen ? 'block' : 'hidden'} absolute left-0 right-0 top-full z-[71] border-y border-neutral-200 bg-white px-4 pb-3 pt-2 shadow-lg md:left-auto md:right-0 md:w-[min(32rem,calc(100vw-2rem))] md:rounded-b-xl md:border-x`}
          >
            {isHeaderSearchOpen && (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  setIsHeaderSearchOpen(false);
                }}
                className="flex items-center gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path strokeLinecap="round" d="m16 16 4.5 4.5" />
                  </svg>
                  <input
                    autoFocus
                    type="search"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder={t('Search products, brands, categories...')}
                    aria-label={t('Search products, brands, categories...')}
                    className="h-11 w-full rounded-lg border border-neutral-300 bg-[#fafaf8] py-2.5 pl-10 pr-3 text-sm text-neutral-900 outline-none transition focus:border-[#173b32] focus:ring-2 focus:ring-[#173b32]/15"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsHeaderSearchOpen(false)}
                  aria-label={t('Close search')}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-neutral-200 text-neutral-700"
                >
                  <span aria-hidden="true" className="text-xl leading-none">×</span>
                </button>
              </form>
            )}
          </div>
        )}
      </header>

      <div className="flex justify-end border-b border-neutral-200 bg-white px-4 py-2 md:hidden">
        <LocaleControls
          compact
          language={language}
          currency={currency}
          onLanguageChange={setLanguage}
          onCurrencyChange={setCurrency}
        />
      </div>

      {(currency !== 'INR' || exchangeRateStatus === 'stale' || exchangeRateStatus === 'partial') && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900" role="status">
          <p>{t('Displayed prices use reference rates; checkout is charged in INR.')}</p>
          {currency !== 'INR' && !selectedCurrencyAvailable && exchangeRateStatus === 'loading' && (
            <p>{t('Loading exchange rates...')}</p>
          )}
          {currency !== 'INR' && !selectedCurrencyAvailable && exchangeRateStatus !== 'loading' && (
            <p>{t('Selected currency rates are unavailable. Prices cannot be converted.')}</p>
          )}
          {exchangeRateStatus === 'stale' && selectedCurrencyAvailable && (
            <p>{t('Exchange rates could not be refreshed. Showing saved reference rates.')}</p>
          )}
          {exchangeRateStatus === 'partial' && selectedCurrencyAvailable && (
            <p>{t('Some exchange rates are unavailable. Choose another currency or INR.')}</p>
          )}
          {exchangeRateDate && selectedCurrencyAvailable && (
            <p>{t('Reference rate date: {date}', { date: exchangeRateDate })}</p>
          )}
        </div>
      )}
      </>
      )}

      {/* MAIN CONTENT */}
      {!isUserAuthPage && (
      <div className="flex-1 bg-[#f1f1ef] text-[#171717]">
        <Routes>
          <Route path="/" element={
            <>
              {(() => {
                return (
                  <main className="bg-[#f1f1ef] text-[#171717]">
                    {!normalizedSearch && (
                    <section
                      className="velqra-home-hero"
                      style={{
                        backgroundImage: `linear-gradient(90deg, rgba(8, 8, 8, 0.88) 0%, rgba(8, 8, 8, 0.62) 48%, rgba(8, 8, 8, 0.18) 100%), url(${banner1})`,
                        backgroundPosition: '100% center'
                      }}
                    >
                      <div>
                        <p>{t('PURE BOTANICAL SCIENCE')}</p>
                        <h1>{t('VELQRA BOTANICAL COLLECTION')}</h1>
                        <span>{t('Pure Botanicals Science for Radiant & Healthy Skin')}</span>
                      </div>
                    </section>
                    )}
                    <section className="max-w-7xl mx-auto px-4 pb-8 pt-4 sm:px-6 sm:py-14">
                      <div className="mb-5 rounded-xl border border-[#d9d9d4] bg-white p-3 sm:mb-8 sm:p-5">
                        <div role="group" aria-label={t('Category filter')} className="flex flex-wrap items-center gap-2">
                            {[
                              { value: 'All', label: t('All') },
                              { value: 'Face Wash', label: t('Face Wash') }
                            ].map(option => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setActiveCategory(option.value)}
                                aria-pressed={activeCategory === option.value}
                                className={`min-h-10 rounded-full border px-5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[#173b32] focus:ring-offset-2 ${
                                  activeCategory === option.value
                                    ? 'border-[#173b32] bg-[#173b32] text-white shadow-sm'
                                    : 'border-[#d9d9d4] bg-white text-[#454640] hover:border-[#173b32] hover:text-[#173b32]'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#73736c]">
                          <span>{t('Showing {count} of {total} products', { count: filteredProducts.length, total: products.length })}</span>
                          {searchQuery && <span className="max-w-full truncate">{t('Search:')} {searchQuery}</span>}
                        </div>
                      </div>
                      {loading ? (
                        <div className="py-20 text-center text-sm font-bold uppercase tracking-widest">{t('Loading products...')}</div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="rounded-lg border border-neutral-200 bg-white py-16 text-center">
                          <p className="font-serif text-2xl">
                            {t(products.length === 0 ? 'No products available' : 'No products match your filters')}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                          {filteredProducts.map(product => {
                            const price = Number(product.price || 0);
                            const originalPrice = Number(product.originalPrice || price);
                            const discount = Number(product.discountPercent || 0);
                            return (
                              <Link key={product._id} to={`/product/${product._id}`} className="velqra-product-grid-card group">
                                <div className="relative">
                                  {discount > 0 && <span className="velqra-product-discount">{discount}% OFF</span>}
                                  <img src={getProductDisplayImage(product)} alt={product.name} className="transition duration-500 group-hover:scale-[1.04]" />
                                </div>
                                <div className="p-3 sm:p-5">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a8a82]">{product.category || 'Botanical'}</p>
                                  <h2 className="mt-2 min-h-[44px] font-serif text-base sm:text-xl leading-tight text-[#1d1d1b]">{product.name}</h2>
                                  <div className="mt-4 flex items-baseline gap-2">
                                    <strong className="text-base sm:text-lg text-[#173b32]">{formatPrice(price)}</strong>
                                    {originalPrice > price && <span className="text-xs text-[#999] line-through">{formatPrice(originalPrice)}</span>}
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </main>
                );
              })()}
            </>
          } />

          <Route path="/product/:id" element={<ProductDetailPage addToCart={addToCart} openCheckout={() => {
            openCart();
            setCheckoutOpen(true);
          }} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy-policy" element={<PolicyPage policy="privacy" />} />
          <Route path="/terms-policy" element={<PolicyPage policy="terms" />} />
          <Route path="/return-refund-policy" element={<PolicyPage policy="returns" />} />
          <Route path="/shipping-policy" element={<PolicyPage policy="shipping" />} />
          <Route path="/contact-policy" element={<PolicyPage policy="contact" />} />
          <Route path="/auth" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<main className="min-h-screen" />} />
          <Route path="/register" element={<main className="min-h-screen" />} />
          <Route path="/admin/login" element={
            isAdminLoggedIn ? <Navigate to="/admin" replace /> : <main className="min-h-[50vh]" />
          } />

          <Route path="/orders" element={<OrdersPage onLoginRequest={() => openUserAuth('login')} />} />
          <Route path="/orders/track/:orderId" element={<OrderTracking />} />

          <Route path="/admin" element={
            isAdminLoggedIn ? (
              <main className="velqra-admin-shell container mx-auto max-w-6xl px-4 py-8 space-y-8 text-slate-900">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-200 pb-4 gap-3">
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                      🛠️ Admin Panel
                      <span className="text-xs font-normal bg-green-100 text-green-700 px-3 py-1 rounded-full">Live</span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">Manage your product catalog</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="bg-[#0B3C5D]/10 text-[#0B3C5D] font-bold text-xs px-3 py-1.5 rounded-lg">
                      📊 {products.length} Items
                    </span>
                    {pendingPaymentOrders.length > 0 && (
                      <span className="bg-yellow-100 text-yellow-700 font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                        <span>⏳</span> {pendingPaymentOrders.length} Pending Payments
                      </span>
                    )}
                  </div>
                </div>

                {pendingPaymentOrders.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                    <h3 className="font-bold text-sm text-yellow-800 flex items-center gap-2 mb-3">
                      <span>⏳</span> Payment Verification Required
                    </h3>
                    <div className="space-y-2">
                      {orders.filter(order => order.status === 'Payment Verification Pending' && order.paymentMethod === 'online').map(order => (
                        <div key={order._id} className="bg-white rounded-xl border border-yellow-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-xs text-slate-800">
                              Order #{order._id.slice(-8).toUpperCase()}
                            </p>
                            <p className="text-xs text-slate-500">
                              {order.delivery?.fullName || 'Guest'} • ₹{order.total}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {order.paymentMethod === 'online' ? '📱 Online Payment' : '💵 COD'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {order.paymentMethod === 'online' && (
                              <button
                                onClick={() => handleVerifyPayment(order._id)}
                                className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition"
                              >
                                ✅ Verify Payment
                              </button>
                            )}
                            <button
                              onClick={() => handleOrderStatusChange(order._id, 'Cancelled')}
                              className="bg-red-50 text-red-600 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                            >
                              Cancel Order
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  {/* Add Product Form */}
                  <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm sticky top-24">
                    <h3 className="font-extrabold text-base text-slate-800 mb-4">➕ Add Product</h3>

                    <form onSubmit={handleAddProduct} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
                      {/* Product Name */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Product Name *</label>
                        <input
                          type="text"
                          value={newProdName}
                          onChange={(e) => setNewProdName(e.target.value)}
                          placeholder="e.g., iPhone 15, Men's T-Shirt"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                          required
                        />
                      </div>

                      {/* Price & Discount */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Original Price *</label>
                          <input
                            type="number"
                            value={newProdOriginalPrice}
                            onChange={(e) => setNewProdOriginalPrice(e.target.value)}
                            placeholder="₹"
                            className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Discount %</label>
                          <input
                            type="number"
                            value={newProdDiscount}
                            onChange={(e) => setNewProdDiscount(e.target.value)}
                            placeholder="0"
                            min="0"
                            max="100"
                            className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                          />
                        </div>
                      </div>

                      {/* Selling Price Preview */}
                      {newProdOriginalPrice && (
                        <div className="text-[11px] text-green-600 font-bold bg-green-50 p-3 rounded-xl border border-green-100 flex justify-between">
                          <span>🏷️ Selling Price:</span>
                          <span>₹{Math.round(parseFloat(newProdOriginalPrice) - (parseFloat(newProdOriginalPrice) * ((parseFloat(newProdDiscount) || 0) / 100)))}</span>
                        </div>
                      )}

                      {/* Product Promo */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Promo Code</label>
                          <input
                            value={newProdPromoCode}
                            onChange={(e) => setNewProdPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                            placeholder="AJAY10"
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Promo Discount %</label>
                          <input
                            type="number"
                            value={newProdPromoDiscount}
                            onChange={(e) => setNewProdPromoDiscount(e.target.value)}
                            min="0"
                            max="100"
                            placeholder="Optional"
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                        </div>
                      </div>

                      {/* Category & Stock */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Category *</label>
                          <select
                            value={newProdCategory}
                            onChange={(e) => setNewProdCategory(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                          >
                            {categories.filter(c => c !== 'All').map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Stock</label>
                          <input
                            type="number"
                            value={newProdStock}
                            onChange={(e) => setNewProdStock(e.target.value)}
                            min="0"
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                        </div>
                      </div>

                      {/* Image URL */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Product Image *</label>
                        <input
                          type="url"
                          value={newProdImageUrl}
                          onChange={(e) => {
                            setNewProdImageUrl(e.target.value);
                            setNewProdImageFile('');
                          }}
                          placeholder="https://example.com/product-image.jpg"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                          required={!newProdImageFile}
                        />
                        <div className="flex items-center gap-2 my-2 text-[10px] text-slate-400">
                          <span className="h-px flex-1 bg-slate-200" />
                          OR
                          <span className="h-px flex-1 bg-slate-200" />
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProductImageUpload}
                          className="w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#0B3C5D] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                        />
                        {newProdImageUrl && (
                          <div className="mt-2">
                            <img
                              src={newProdImageUrl}
                              alt="Preview"
                              className="h-16 w-16 object-cover rounded-lg border border-slate-200"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = 'https://via.placeholder.com/64/FF5722/FFFFFF?text=Invalid+URL';
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Additional Images */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Additional Images</label>
                        <input
                          type="text"
                          value={newProdImages}
                          onChange={(e) => setNewProdImages(e.target.value)}
                          placeholder="https://example.com/img1.jpg, https://example.com/img2.jpg"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                        />
                      </div>

                      {/* Brand */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Brand</label>
                        <input
                          type="text"
                          value={newProdBrand}
                          onChange={(e) => setNewProdBrand(e.target.value)}
                          placeholder="Brand name"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                        />
                      </div>

                      {/* Video URL */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Video URL (YouTube/Vimeo)</label>
                        <input
                          type="url"
                          value={newProdVideoUrl}
                          onChange={(e) => setNewProdVideoUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                        />
                        {newProdVideoUrl && (
                          <div className="mt-2 text-[10px] text-green-600">
                            ✅ Video URL added: {newProdVideoUrl}
                          </div>
                        )}
                      </div>

                      {/* Video Platform */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Video Platform</label>
                        <select
                          value={newProdVideoType}
                          onChange={(e) => setNewProdVideoType(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                        >
                          <option value="youtube">YouTube</option>
                          <option value="vimeo">Vimeo</option>
                        </select>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Description</label>
                        <textarea
                          value={newProdDescription}
                          onChange={(e) => setNewProdDescription(e.target.value)}
                          placeholder="Detailed product description..."
                          rows="3"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider hover:bg-[#07263b] transition disabled:opacity-50"
                      >
                        {loading ? '⏳ Processing...' : '🚀 Add Product'}
                      </button>
                    </form>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    {/* Orders Table */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-extrabold text-base text-slate-800">📦 Orders</h3>
                        <span className="text-[10px] font-bold uppercase text-slate-400">{orders.length} total</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              <th className="py-3 px-4">Order ID</th>
                              <th className="py-3 px-4">Customer</th>
                              <th className="py-3 px-4">Payment</th>
                              <th className="py-3 px-4">Total</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs font-medium">
                            {ordersLoading ? (
                              <tr><td colSpan="6" className="py-8 text-center text-slate-400">Loading orders...</td></tr>
                            ) : orders.length === 0 ? (
                              <tr><td colSpan="6" className="py-8 text-center text-slate-400">No orders yet</td></tr>
                            ) : (
                              orders.map(order => (
                                <tr key={order._id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-3 px-4 font-bold text-slate-800">{order._id.slice(-6).toUpperCase()}</td>
                                  <td className="py-3 px-4">
                                    <div>
                                      <div className="font-bold text-slate-800">{order.delivery?.fullName || 'Guest'}</div>
                                      <div className="text-[10px] text-slate-400">{order.delivery?.email}</div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="text-slate-700">{order.paymentMethod === 'online' ? '📱 Online' : '💵 COD'}</div>
                                  </td>
                                  <td className="py-3 px-4 font-bold text-[#0B3C5D]">₹{order.total}</td>
                                  <td className="py-3 px-4">
                                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                                      order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                                      order.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                      order.status === 'Shipped' ? 'bg-purple-100 text-purple-700' :
                                      order.status === 'Payment Verified' ? 'bg-green-100 text-green-700' :
                                      order.status === 'Payment Verification Pending' ? 'bg-orange-100 text-orange-700' :
                                      order.status === 'Confirmed' ? 'bg-blue-100 text-blue-700' :
                                      order.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-slate-100 text-slate-700'
                                    }`}>
                                      {order.status === 'Payment Verification Pending' ? '⏳ Payment Pending' : order.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-col gap-1">
                                      <select
                                        value={order.status}
                                        onChange={(e) => handleOrderStatusChange(order._id, e.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                      >
                                        <option value="Pending">Pending</option>
                                        <option value="Payment Verification Pending">Payment Pending</option>
                                        <option value="Payment Verified">Payment Verified</option>
                                        <option value="Confirmed">Confirmed</option>
                                        <option value="Shipped">Shipped</option>
                                        <option value="Delivered">Delivered</option>
                                        <option value="Cancelled">Cancelled</option>
                                      </select>
                                      {order.status === 'Payment Verification Pending' && order.paymentMethod === 'online' && (
                                        <button
                                          onClick={() => handleVerifyPayment(order._id)}
                                          className="text-[10px] font-bold text-green-600 hover:text-green-700"
                                        >
                                          ✅ Verify Payment
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Products Table */}
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              <th className="py-3 px-4">Product</th>
                              <th className="py-3 px-4 hidden sm:table-cell">Category</th>
                              <th className="py-3 px-4">Price</th>
                              <th className="py-3 px-4 hidden md:table-cell">Stock</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs font-medium">
                            {products.length === 0 ? (
                              <tr>
                                <td colSpan="5" className="py-12 text-center text-slate-400">
                                  <div className="text-4xl mb-2">📭</div>
                                  No products
                                </td>
                              </tr>
                            ) : (
                              products.map(product => (
                                <tr key={product._id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <img
                                        src={getProductDisplayImage(product)}
                                        alt={product.name}
                                        className="h-8 w-8 object-cover rounded-lg"
                                        loading="lazy"
                                        onError={(e) => {
                                          e.target.onerror = null;
                                          e.target.src = getProductDisplayImage(product);
                                        }}
                                      />
                                      <div>
                                        <span className="font-bold text-slate-800 line-clamp-1 max-w-[120px]">{product.name}</span>
                                        {product.attributes && Object.keys(product.attributes).length > 0 && (
                                          <div className="text-[8px] text-slate-400">
                                            {Object.keys(product.attributes).join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 hidden sm:table-cell">
                                    <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] uppercase font-bold text-slate-500">
                                      {product.category}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-col">
                                      <span className="font-black text-[#0B3C5D]">₹{product.price}</span>
                                      {product.discountPercent > 0 && (
                                        <span className="text-[9px] text-slate-400 line-through">₹{product.originalPrice}</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 hidden md:table-cell">
                                    <span className={`text-xs font-bold ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      {product.stock > 0 ? product.stock : 'Out'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <button
                                      onClick={() => handleDeleteProduct(product._id)}
                                      className="text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg font-bold transition"
                                    >
                                      🗑️
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            ) : (
              <Navigate to="/admin/login" replace />
            )
          } />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      )}

      {/* USER AUTH MODAL */}
      {isAuthModalOpen && isUserAuthPage && (
        <div
          className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-[#f1f1ef] p-4 sm:p-8"
        >
          <div
            className="velqra-auth-modal relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
          >
            <button
              onClick={() => {
                sessionStorage.setItem('velqra_login_prompt_seen', 'true');
                setIsAuthModalOpen(false);
                navigate('/');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>

            <div className="mb-5 flex items-center justify-center" aria-label="VELQRA">
              <img src={velqraLogo} alt="VELQRA" className="h-16 w-16 object-contain" />
            </div>

            {userAuthMode === 'login' ? (
              // LOGIN
              <>
                <h3 className="text-lg font-black text-[#0B3C5D] mb-1">Welcome Back!</h3>
                <p className="text-[11px] text-slate-400 mb-4">Login to your account to continue shopping</p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleUserLogin} className="space-y-3.5">
                  <input
                    type="text"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    autoComplete="username"
                    placeholder="Email address or mobile number"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <input
                    type="password"
                    required
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsAuthModalOpen(false);
                      setIsForgotPasswordOpen(true);
                    }}
                    className="text-[10px] text-[#0B3C5D] font-bold hover:underline block text-right"
                  >
                    Forgot Password?
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b]"
                  >
                    {loading ? '⏳ Processing...' : 'Login'}
                  </button>
                </form>

                <div className="mt-4 text-center text-[10px] text-slate-400">
                  Don't have an account?{' '}
                  <button
                    onClick={() => {
                      setRegStep('form');
                      setError('');
                      setRegName('');
                      setRegEmail('');
                      setRegPhone('');
                      setRegPassword('');
                      setRegConfirmPassword('');
                      setRegEmailOtp('');
                      setRegSmsOtp('');
                      openUserAuth('register');
                    }}
                    className="font-bold text-[#0B3C5D] hover:underline"
                  >
                    Sign Up
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('velqra_login_prompt_seen', 'true');
                    setIsAuthModalOpen(false);
                    navigate('/');
                  }}
                  className="mt-4 w-full border-t border-slate-100 pt-4 text-center text-xs font-bold text-slate-500 hover:text-[#173b32]"
                >
                  Continue without login
                </button>
              </>
            ) : regStep === 'form' ? (
              // REGISTER - Step 1: Form
              <>
                <h3 className="text-lg font-black text-[#0B3C5D] mb-1">Create Account</h3>
                <p className="text-[11px] text-slate-400 mb-4">Fill details to register. OTP will be sent to your mobile.</p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSendRegistrationOTP} className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Full name
                    <input
                      type="text"
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Your full name"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Gmail address
                    <input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      required
                      maxLength={254}
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mobile number
                    <input
                      type="tel"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Confirm password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      maxLength={72}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Enter your password again"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                    />
                  </label>
                  <p className="text-xs leading-relaxed text-slate-500">
                    We’ll verify that you own both your email address and mobile number.
                  </p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-[#173b32] py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#102a24] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? 'Sending verification codes…' : 'Verify email & mobile'}
                  </button>
                </form>

                <div className="mt-4 text-center text-[10px] text-slate-400">
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setError('');
                      openUserAuth('login');
                    }}
                    className="font-bold text-[#0B3C5D] hover:underline"
                  >
                    Sign In
                  </button>
                </div>
              </>
            ) : regStep === 'otp' ? (
              // REGISTER - Step 2: Verify email and mobile
              <>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-2xl">🔐</span>
                  <h3 className="text-lg font-black text-white">Verify your email and mobile</h3>
                </div>
                <p className="text-[11px] text-slate-400 mb-4">
                  Enter the separate 6-digit codes sent to <strong>{regEmail}</strong> and mobile ending in <strong>{regPhone.slice(-4)}</strong>.
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleVerifyRegistrationOTP} className="space-y-4">
                  <label className="block text-xs font-semibold text-white">
                    Email verification code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={6}
                      value={regEmailOtp}
                      onChange={(e) => setRegEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit email code"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-base font-bold tracking-[0.3em] text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-white">
                    Mobile verification code
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={regSmsOtp}
                    onChange={(e) => setRegSmsOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit SMS code"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-base font-bold tracking-[0.3em] text-slate-900 focus:border-[#173b32] focus:outline-none focus:ring-4 focus:ring-[#173b32]/10"
                  />
                  </label>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {regTimer > 0 ? `Resend in ${regTimer}s` : "Didn't receive OTP?"}
                    </span>
                    <button
                      type="button"
                      onClick={handleResendRegistrationOTP}
                      disabled={regResendDisabled || loading}
                      className="font-bold text-[#0B3C5D] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Resend OTP
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || regEmailOtp.length !== 6 || regSmsOtp.length !== 6}
                    className="w-full bg-green-600 text-white font-bold py-3 rounded-xl text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading ? '⏳ Verifying...' : '✅ Verify & Register'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRegStep('form');
                      setError('');
                    }}
                    className="w-full text-center text-[10px] text-slate-400 hover:text-[#0B3C5D] transition"
                  >
                    ← Back to Registration
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* FORGOT PASSWORD MODAL */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => {
          setIsForgotPasswordOpen(false);
          setIsAuthModalOpen(true);
          setUserAuthMode('login');
        }}
        onBackToLogin={() => {
          setIsForgotPasswordOpen(false);
          setIsAuthModalOpen(true);
          setUserAuthMode('login');
        }}
      />

            {/* 🆕 ORDER OTP MODAL */}
      <OrderOTPModal
        isOpen={isOrderOTPModalOpen}
        onClose={() => {
          setIsOrderOTPModalOpen(false);
          setPendingOrderData(null);
        }}
        onVerified={handleVerifyOrderOTP}
      />

      {/* ADMIN AUTH MODAL */}
      {showAdminAuth && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => {
            setShowAdminAuth(false);
            setAdminAuthMode('login');
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-100 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowAdminAuth(false);
                setAdminAuthMode('login');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">👑</span>
              <h3 className="text-lg font-black text-[#0B3C5D]">
                Admin Login
              </h3>
            </div>
            <p className="mb-4 text-[11px] text-slate-600">
              Enter your admin credentials to access the admin panel
            </p>

            <form onSubmit={handleAdminLogin} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-700">Username</label>
                <input
                  type="text"
                  value="admin"
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-[#0B3C5D] focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-[#0B3C5D] focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider hover:bg-[#07263b] transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? '⏳ Processing...' : '🔑 Login'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CART SIDEBAR */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-50 flex justify-end backdrop-blur-sm"
          onClick={closeCart}
        >
          <div
            className="velqra-cart-panel bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <h2 className="relative top-1 text-lg font-black text-[#0B3C5D]">🛒 {t('Cart')}</h2>
                <button onClick={closeCart} className="text-gray-400 hover:text-black font-bold text-lg">
                  ✕
                </button>
              </div>

              {cartLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#173b32]/15 border-t-[#173b32]" />
                  <p className="text-sm font-medium text-slate-500">Loading your saved cart…</p>
                </div>
              ) : cart.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="text-6xl mb-4">🛍️</div>
                  <p className="text-slate-400 text-sm font-medium">{t('Cart is empty')}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {cart.map(item => (
                    <div key={getCartItemKey(item)} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-xl hover:shadow-sm transition">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <img src={getProductDisplayImage(item)} alt={item.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200" loading="lazy" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-slate-800 truncate">{item.name}</h4>
                          {item.selectedAttributes && Object.keys(item.selectedAttributes).length > 0 && (
                            <div className="text-[9px] text-slate-400 flex gap-1 flex-wrap">
                              {Object.entries(item.selectedAttributes).map(([key, value]) => (
                                value && <span key={key}>{key}: {value}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] text-slate-400">{formatPrice(item.price)} × {item.qty}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 flex-shrink-0">
                        <button onClick={() => updateQty(item, -1)} className="px-2 py-0.5 font-bold text-slate-400 hover:text-[#FF5722] text-xs transition">−</button>
                        <span className="text-xs font-bold w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item, 1)} className="px-2 py-0.5 font-bold text-slate-400 hover:text-[#0B3C5D] text-xs transition">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-3 flex-shrink-0">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{t('Subtotal')}</span>
                  <span className="font-bold">{formatPrice(totalCartPrice)}</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">{t('Delivery Charge')}</span>
                  <span className={`font-bold ${deliveryCharge === 0 ? 'text-green-600' : 'text-[#FF5722]'}`}>
                    {deliveryCharge === 0 ? `🎉 ${t('Free')}` : formatPrice(deliveryCharge)}
                  </span>
                </div>

                {deliveryCharge === 0 && (
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-green-600 font-bold">
                      🎉 {t('Free delivery! (Order above INR 199)')}
                    </p>
                  </div>
                )}

                {deliveryCharge > 0 && (
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">
                      {t('Add {amount} more for free delivery', { amount: formatPrice(199 - totalCartPrice) })} 🚚
                    </p>
                  </div>
                )}

                {totalSavings > 0 && (
                  <div className="flex justify-between items-center text-xs text-green-600">
                    <span>💰 {t('Total Savings')}</span>
                    <span className="font-bold">{formatPrice(totalSavings)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-slate-100">
                  <span className="text-slate-600">{t('Grand Total:')}</span>
                  <span className="text-[#0B3C5D] text-lg font-black">{formatPrice(grandTotal)}</span>
                </div>
                {currency !== 'INR' && (
                  <p className="text-[10px] text-center text-amber-700">{t('Displayed prices use reference rates; checkout is charged in INR.')}</p>
                )}
                {checkoutOpen ? (
                  <form onSubmit={handlePlaceOrder} className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                    {/* Delivery Form */}
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">{t('Delivery Details')}</p>
                      <div className="grid gap-2">
                        <input
                          required
                          value={deliveryForm.fullName}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder={t('Full Name *')}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <input
                          required
                          value={deliveryForm.phone || getRegisteredPhone(currentUser)}
                          readOnly
                          title="Registered phone number cannot be changed"
                          placeholder={registeredPhoneLoading ? t('Loading registered phone...') : t('Phone Number *')}
                          className="w-full bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-600 cursor-not-allowed"
                        />
                        <input
                          required={paymentMethod === 'cod'}
                          type="tel"
                          value={deliveryForm.alternatePhone}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, alternatePhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          placeholder={`${t('Alternate Phone Number')}${paymentMethod === 'cod' ? ' *' : ''}`}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <input
                          type="email"
                          value={deliveryForm.email}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder={t('Email')}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <textarea
                          required
                          value={deliveryForm.address}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, address: e.target.value }))}
                          placeholder={t('Complete Address *')}
                          rows="2"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <input
                          value={deliveryForm.landmark}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, landmark: e.target.value }))}
                          placeholder={t('Landmark (optional)')}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            required
                            value={deliveryForm.city}
                            onChange={(e) => setDeliveryForm(prev => ({ ...prev, city: e.target.value }))}
                            placeholder={t('City *')}
                            className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                          <input
                            required
                            value={deliveryForm.state}
                            onChange={(e) => setDeliveryForm(prev => ({ ...prev, state: e.target.value }))}
                            placeholder={t('State *')}
                            className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                        </div>
                        <input
                          required
                          value={deliveryForm.pincode}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, pincode: e.target.value }))}
                          placeholder={t('Pincode *')}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <textarea
                          value={deliveryForm.note}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, note: e.target.value }))}
                          placeholder={t('Delivery note (optional)')}
                          rows="2"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:border-[#0B3C5D]"
                        />
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">{t('Payment Method')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cod')}
                          className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                            paymentMethod === 'cod'
                              ? 'bg-[#0B3C5D] text-white shadow-md'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          💵 {t('Cash on Delivery')}
                        </button>

                                                <button
                          type="button"
                          onClick={() => setPaymentMethod('online')}
                          className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                            paymentMethod === 'online'
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center justify-center gap-1">
                            <span>🔒</span> {t('Online Payment')}
                          </span>
                        </button>
                      </div>

                                            {paymentMethod === 'online' && (
                        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                          <div className="flex items-start gap-2">
                            <span className="text-lg">🔒</span>
                            <div>
                              <p className="text-xs font-bold text-blue-700">{t('Secure Payment via PayU')}</p>
                              <p className="text-[10px] text-blue-600 mt-1 leading-relaxed">
                                {t("After placing the order, you will be redirected to PayU's secure payment page. Pay using UPI, Credit/Debit Card, Net Banking, or Wallet.")}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <label className="flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={marketingConsent}
                        onChange={(e) => setMarketingConsent(e.target.checked)}
                        className="mt-0.5 accent-[#0B3C5D]"
                      />
                      <span>
                        {t('I agree to share my contact details and order data with Meta for advertising measurement. This is optional and does not affect checkout.')}
                      </span>
                    </label>

                    <div className="flex flex-col gap-2">
                                            <button
                        type="submit"
                        disabled={placingOrder}
                        className={`w-full font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 ${
                          paymentMethod === 'online'
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-[#FF5722] text-white hover:bg-[#e64a19]'
                        } ${placingOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {placingOrder ? (
                          <>
                            <span className="animate-spin">⏳</span> Processing...
                          </>
                        ) : paymentMethod === 'online' ? (
                          <>🔒 {t('Place Order & Pay')} {formatPrice(grandTotal)} via PayU (INR)</>
                        ) : (
                          <>📦 {t('Place Order')} ({formatPrice(grandTotal)})</>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={resetCheckout}
                        className="w-full bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl text-sm hover:bg-slate-200 transition"
                      >
                        {t('Cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setCheckoutOpen(true)}
                    className="w-full bg-[#FF5722] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-[#e64a19] transition shadow-md"
                  >
                    ✅ {t('Proceed to Checkout')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      {!isUserAuthPage && (
      <footer className="border-t border-neutral-800 bg-neutral-950 py-12 px-6 mt-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <Link to="/" aria-label="VELQRA home" className="mb-3 flex items-center gap-2">
              <img src={velqraLogo} alt="" className="header-brand-image" />
              <span className="font-serif text-xl font-bold tracking-[0.08em] text-[#173b32]">
                VELQRA<sup className="ml-0.5 text-[8px] font-normal text-[#d4af37]">™</sup>
              </span>
            </Link>
            <p className="text-xs text-neutral-400 leading-relaxed">Premium International Skin Science. Formulated with pure botanical actives for radiant, healthy skin.</p>
          </div>
          <div>
            <h5 className="text-xs font-bold text-neutral-300 uppercase mb-3">LEGAL & POLICIES</h5>
            <ul className="space-y-2 text-xs text-neutral-400">
              {[
                ['Shipping Policy', '/shipping-policy'],
                ['Privacy Policy', '/privacy-policy'],
                ['Terms & Conditions', '/terms-policy'],
                ['Returns & Refund Policy', '/return-refund-policy'],
                ['Contact Policy', '/contact-policy'],
                ['About Us', '/about']
              ].map(([label, path]) => (
                <li key={path}>
                  <Link to={path} className="hover:text-amber-400">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5 className="text-xs font-bold text-neutral-300 uppercase mb-3">SUPPORT</h5>
            <a href="mailto:officialvelqra@gmail.com" className="break-all text-xs text-neutral-400 hover:text-amber-400">
              officialvelqra@gmail.com
            </a>
            <a href="tel:+919050054177" className="mt-2 block text-xs text-neutral-400 hover:text-amber-400">
              +91 90500 54177
            </a>
          </div>
          <div>
            <h5 className="text-xs font-bold text-neutral-300 uppercase mb-3">LOCATION</h5>
            <p className="mb-3 text-xs leading-relaxed text-neutral-400">
              Near Priyanka Dhaba, Balaji Hospital, Ward No. 11, Ateli Mandi, Mahendragarh, Haryana
            </p>
            <iframe
              title="VELQRA store location"
              src="https://www.google.com/maps?q=28.1038478,76.2499368&z=19&output=embed"
              className="h-36 w-full rounded-lg border border-neutral-800"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
          <div>
            <h5 className="text-xs font-bold text-neutral-300 uppercase mb-3">SOCIAL</h5>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/officialvelqra" target="_blank" rel="noreferrer" aria-label="VELQRA on Instagram" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition hover:border-[#d4af37] hover:text-[#d4af37]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href="https://www.facebook.com/officialvelqra" target="_blank" rel="noreferrer" aria-label="VELQRA on Facebook" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition hover:border-[#d4af37] hover:text-[#d4af37]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.2-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.6v3h2.7v8h3.4z" />
                </svg>
              </a>
              <a href="https://www.youtube.com/@officialvelqra" target="_blank" rel="noreferrer" aria-label="VELQRA on YouTube" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition hover:border-[#d4af37] hover:text-[#d4af37]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto border-t border-neutral-900 mt-8 pt-6 text-center text-[11px] text-neutral-600">
            © {new Date().getFullYear()} VELQRA. All Rights Reserved.
          </div>
        </footer>
      )}
    </div>
    </LocalizationContext.Provider>
  );
}
