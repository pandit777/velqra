import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Link, useLocation, useParams, Navigate } from 'react-router-dom';
import axios from 'axios';
import logo from './assets/logo.png';
import banner1 from './assets/banner1.png';
import banner2 from './assets/banner2.png';
import banner3 from './assets/banner3.png';

// =============================================
// API URLs - SECURE (Environment Variables)
// =============================================
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const AUTH_URL = import.meta.env.VITE_AUTH_URL || `${API_URL}/auth`;

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

// =============================================
// FORGOT PASSWORD MODAL
// =============================================
const ForgotPasswordModal = ({ isOpen, onClose, onBackToLogin }) => {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timer, setTimer] = useState(0);
  const [resendDisabled, setResendDisabled] = useState(false);

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
      setStep('email');
      setEmail('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setError('');
      setSuccess('');
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
      
      if (response.data.success) {
        setSuccess('✅ OTP sent successfully! Please check your email.');
        setStep('otp');
        startTimer();
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
        email, 
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

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
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
        email, 
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

    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
      
      if (response.data.success) {
        setSuccess('✅ OTP resent successfully!');
        startTimer();
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
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 shadow-2xl relative"
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
            {step === 'email' && 'Forgot Password'}
            {step === 'otp' && 'Verify OTP'}
            {step === 'reset' && 'Reset Password'}
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-4">
          {step === 'email' && 'Enter your registered email to receive OTP'}
          {step === 'otp' && 'Enter the OTP sent to your email'}
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

        {step === 'email' && (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
              <p className="text-[10px] text-slate-400 mt-1 text-center">OTP sent to {email}</p>
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
              onClick={() => setStep('email')}
              className="w-full text-center text-[10px] text-slate-400 hover:text-[#0B3C5D] transition"
            >
              ← Change Email
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
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
              />
              <p className="text-[9px] text-slate-400 mt-1">Minimum 6 characters</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Confirm Password</label>
              <input
                type="password"
                required
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

// =============================================
// ABOUT PAGE
// =============================================
const POLICY_CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    intro: 'AteliMarket respects your privacy and protects the personal information shared while using our website.',
    sections: [
      ['Information we collect', 'We may collect your name, contact details, delivery address, order information and account details when you use AteliMarket.'],
      ['How we use information', 'Your information is used to process orders, provide support, improve the shopping experience and communicate important account or order updates.'],
      ['Data protection', 'We use reasonable technical and organizational measures to protect your information. Payment details should not be shared through public messages or unsupported channels.'],
      ['Your choices', 'You may request corrections or deletion of your account information by contacting our support team, subject to records required for active orders and legal obligations.']
    ]
  },
  terms: {
    title: 'Terms & Conditions',
    intro: 'These terms govern your use of AteliMarket and placement of orders through the website.',
    sections: [
      ['Website use', 'You agree to use the website lawfully and provide accurate account, billing, delivery and contact information.'],
      ['Orders and availability', 'An order is confirmed only after successful placement and confirmation. Products, prices and availability may change before dispatch.'],
      ['Pricing and payment', 'All prices are shown in INR unless stated otherwise. Applicable delivery charges or taxes will be displayed during checkout.'],
      ['Account responsibility', 'Keep your login credentials confidential and notify us promptly if you suspect unauthorized account activity.']
    ]
  },
  returns: {
    title: 'Return & Refund Policy',
    intro: 'We want every AteliMarket purchase to be reliable, safe and satisfactory.',
    sections: [
      ['Return request', 'Contact support within 48 hours of delivery for damaged, defective, incorrect or missing items, along with your order number and photos.'],
      ['Eligible items', 'Products must be unused, in original packaging and include all accessories, labels and free items received with the order.'],
      ['Refunds', 'Approved refunds are processed to the original payment method. Cash-on-delivery refunds may require verified bank details.'],
      ['Non-returnable items', 'Personal care, hygiene, opened consumables and specially customized products may not be returnable unless they arrived damaged or defective.']
    ]
  },
  shipping: {
    title: 'Shipping Policy',
    intro: 'AteliMarket aims to deliver orders safely and within the timeframe shown during checkout.',
    sections: [
      ['Processing time', 'Most confirmed orders are processed within 1-3 business days, excluding public holidays and service disruptions.'],
      ['Delivery time', 'Delivery timelines vary by location and product. The estimated date shown at checkout is indicative and may change due to courier availability.'],
      ['Shipping address', 'Customers must provide a complete and accurate delivery address. Failed delivery caused by incorrect information may incur additional charges.'],
      ['Tracking', 'Tracking details are shared when available. Contact support if your order has not moved within the expected processing period.']
    ]
  },
  contact: {
    title: 'Contact Policy',
    intro: 'Our support team is available to help with orders, payments, deliveries and account questions.',
    sections: [
      ['Support email', 'Email gs8901346287@gmail.com with your order number and a clear description of the issue.'],
      ['Response time', 'We aim to respond within 1-2 business days. Order or delivery cases may require additional time for courier verification.'],
      ['Information required', 'Please include your registered name, order ID and relevant screenshots. Do not share passwords, full card numbers or OTPs.'],
      ['Escalations', 'If a resolution remains unresolved, reply to the latest support email and mark the message for follow-up.']
    ]
  }
};

const PolicyPage = ({ policy }) => {
  const content = POLICY_CONTENT[policy];
  return (
    <main className="bg-[#f7f9f6] min-h-[70vh] py-10 md:py-14">
      <article className="container mx-auto max-w-4xl">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="bg-[#0B3C5D] px-6 py-8 md:px-10 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">AteliMarket</p>
            <h1 className="text-3xl md:text-4xl font-black mt-2">{content.title}</h1>
          </div>
          <div className="px-6 py-8 md:px-10 md:py-10">
            <p className="text-slate-600 leading-7">{content.intro}</p>
            <div className="mt-8 grid gap-6">
              {content.sections.map(([heading, text]) => (
                <section key={heading} className="border-t border-slate-100 pt-6">
                  <h2 className="text-lg font-bold text-slate-900">{heading}</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{text}</p>
                </section>
              ))}
            </div>
            <p className="mt-8 text-xs text-slate-400">Last updated: November 2026</p>
          </div>
        </div>
      </article>
    </main>
  );
};

const AboutPage = () => {
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
                with a strong interest in full-stack web development. I built AteliMarket to 
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
                <a href="mailto:gs8901346287@gmail.com" className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <span className="text-sm font-medium">Email</span>
                </a>
                <a href="tel:+918901346287" className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg transition flex items-center gap-2">
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

// =============================================
// PRODUCT DETAIL PAGE - WITH VIDEO & ATTRIBUTES
// =============================================
const ProductDetailPage = ({ addToCart }) => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [mainImage, setMainImage] = useState('');
  const [selectedAttributes, setSelectedAttributes] = useState({});
  const [promoInput, setPromoInput] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProductDetails = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/products/${id}`);
        
        if (response.data.success) {
          const apiProduct = response.data.product;
          const productData = {
            ...apiProduct,
            promoCode: apiProduct.promoCode || apiProduct.promo_code || '',
            promoDiscount: Number(apiProduct.promoDiscount ?? apiProduct.promo_discount ?? 0)
          };
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
          setError('Product not found');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to fetch product');
      } finally {
        setLoading(false);
      }
    };
    fetchProductDetails();
  }, [id]);

  const handleAddToCart = () => {
    if (!product) return;
    
    if (product.attributes && Object.keys(product.attributes).length > 0) {
      const allSelected = Object.keys(product.attributes).every(key => {
        return selectedAttributes[key] && selectedAttributes[key].trim() !== '';
      });
      
      if (!allSelected) {
        alert('Please select all options before adding to cart.');
        return;
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
    
    if (addToCart) {
      addToCart(productWithAttributes);
    } else {
      const event = new CustomEvent('addToCart', { detail: productWithAttributes });
      window.dispatchEvent(event);
    }
    navigate('/');
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
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <nav className="text-sm text-slate-400 mb-6">
        <Link to="/" className="hover:text-[#0B3C5D] transition">Home</Link>
        <span className="mx-2">/</span>
        <Link to={`/?category=${product.category}`} className="hover:text-[#0B3C5D] transition">{product.category}</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700 font-medium">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <img 
              src={selectedImage || mainImage} 
              alt={product.name}
              className="w-full h-96 object-contain rounded-xl"
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

        <div className="space-y-6">
          <div>
            <span className="inline-block bg-slate-100 text-slate-500 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3">
              {product.category}
            </span>
            <h1 className="text-3xl font-black text-slate-900 leading-tight">{product.name}</h1>
            {product.brand && (
              <p className="text-sm text-slate-500 mt-1">Brand: <span className="font-medium">{product.brand}</span></p>
            )}
          </div>

          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl font-black text-[#0B3C5D]">₹{promoPrice}</span>
              {product.discountPercent > 0 && (
                <>
                  <span className="text-lg text-slate-400 line-through">₹{product.originalPrice}</span>
                  {promoApplied && (
                    <span className="text-sm text-slate-400 line-through">₹{product.price}</span>
                  )}
                  <span className="bg-green-100 text-green-700 font-bold text-sm px-3 py-1 rounded-full">
                    -{product.discountPercent}% OFF
                  </span>
                </>
              )}
            </div>
            {product.discountPercent > 0 && (
              <p className="text-sm text-green-600 font-medium mt-1">
                You save ₹{product.originalPrice - promoPrice}
              </p>
            )}
            {!product.discountPercent && promoApplied && (
              <p className="text-sm text-green-600 font-medium mt-1">
                Promo savings: ₹{promoSavings}
              </p>
            )}
          </div>

          {product.promoCode && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-green-700">Promo offer on this product</p>
              <div className="flex gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => {
                    setPromoInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                    setPromoApplied(false);
                  }}
                  placeholder="Enter promo code"
                  className="min-w-0 flex-1 rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm font-bold uppercase outline-none focus:border-green-600"
                />
                <button
                  type="button"
                  onClick={applyProductPromo}
                  className="rounded-xl bg-green-700 px-4 text-sm font-bold text-white hover:bg-green-800"
                >
                  Apply
                </button>
              </div>
              {promoApplied && (
                <p className="mt-3 text-sm font-bold text-green-700">
                  {product.promoDiscount}% extra discount applied — save ₹{Math.round(product.price * product.promoDiscount / 100)}
                </p>
              )}
            </div>
          )}

          {/* ✅ ATTRIBUTES */}
          {hasAttributes && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-sm text-slate-700 mb-4 flex items-center gap-2">
                <span>📋</span> Select Options
              </h3>
              <div className="space-y-4">
                {Object.entries(product.attributes).map(([key, values]) => (
                  <div key={key}>
                    <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
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
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-400">
                {Object.keys(selectedAttributes).length > 0 && (
                  <span>Selected: {Object.entries(selectedAttributes).map(([key, value]) => `${key}: ${value}`).join(', ')}</span>
                )}
              </div>
            </div>
          )}

          {/* ✅ VIDEO */}
          {hasVideo && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                <span>🎬</span> Product Video
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
                {product.stock > 0 ? `In Stock (${product.stock} available)` : 'Out of Stock'}
              </span>
            </div>
          </div>

          {product.description && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-sm text-slate-700 mb-2 flex items-center gap-2">
                <span>📝</span> Description
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {product.description}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button 
              onClick={handleAddToCart}
              disabled={product.stock <= 0}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition ${
                product.stock > 0
                  ? 'bg-[#FF5722] text-white hover:bg-[#e64a19] shadow-md'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {product.stock > 0 ? '🛒 Add to Cart' : 'Out of Stock'}
            </button>
            <Link to="/" className="px-6 py-3.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
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
const OrdersPage = ({ setIsAuthModalOpen, setUserAuthMode }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('atelimarket_user_token');
      
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getStatusBadge = (status, paymentMethod) => {
    if (paymentMethod === 'cod') {
      const styles = {
        'Pending': 'bg-yellow-100 text-yellow-700',
        'Confirmed': 'bg-blue-100 text-blue-700',
        'Shipped': 'bg-purple-100 text-purple-700',
        'Delivered': 'bg-green-100 text-green-700',
        'Cancelled': 'bg-red-100 text-red-700'
      };
      return styles[status] || 'bg-slate-100 text-slate-700';
    } else {
      const styles = {
        'Payment Verification Pending': 'bg-orange-100 text-orange-700',
        'Payment Verified': 'bg-green-100 text-green-700',
        'Confirmed': 'bg-blue-100 text-blue-700',
        'Shipped': 'bg-purple-100 text-purple-700',
        'Delivered': 'bg-green-100 text-green-700',
        'Cancelled': 'bg-red-100 text-red-700'
      };
      return styles[status] || 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusDisplay = (status, paymentMethod) => {
    if (paymentMethod === 'cod') {
      return status;
    } else {
      const statusMap = {
        'Payment Verification Pending': '⏳ Payment Pending',
        'Payment Verified': '✅ Payment Verified',
        'Confirmed': '📋 Order Confirmed',
        'Shipped': '🚚 Shipped',
        'Delivered': '📦 Delivered',
        'Cancelled': '❌ Cancelled'
      };
      return statusMap[status] || status;
    }
  };

  const canCancelOrder = (order) => {
    if (order.status === 'Delivered' || order.status === 'Cancelled') return false;
    if (order.status === 'Shipped' || order.status === 'Confirmed' || order.status === 'Payment Verified') return false;
    if (order.paymentMethod === 'cod' && order.status === 'Pending') return true;
    if (order.paymentMethod === 'online' && order.status === 'Payment Verification Pending') return true;
    return false;
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    
    const token = localStorage.getItem('atelimarket_user_token');
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
        <p className="text-slate-400 mt-4">Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-red-500 font-bold">{error}</p>
        <button 
          onClick={() => {
            if (setUserAuthMode) setUserAuthMode('login');
            if (setIsAuthModalOpen) setIsAuthModalOpen(true);
          }}
          className="mt-4 inline-block bg-[#0B3C5D] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#07263b] transition"
        >
          Login to view orders
        </button>
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
          {orders.map((order) => {
            const isCOD = order.paymentMethod === 'cod';
            const statusDisplay = getStatusDisplay(order.status, order.paymentMethod);
            const statusBadgeClass = getStatusBadge(order.status, order.paymentMethod);
            const isCancellable = canCancelOrder(order);
            
            return (
              <div key={order._id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-600">
                        #{order._id.slice(-8).toUpperCase()}
                      </span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusBadgeClass}`}>
                        {statusDisplay}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCOD ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isCOD ? '💵 COD' : '📱 Online'}
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
                      <span className="text-slate-600">{order.items?.length || 0} items</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-[#0B3C5D]">₹{order.total}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/orders/track/${order._id}`} className="bg-[#0B3C5D] text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-[#07263b] transition text-center whitespace-nowrap">
                      Track Order →
                    </Link>
                    {isCancellable && (
                      <button onClick={() => handleCancelOrder(order._id)} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-100 transition whitespace-nowrap">
                        Cancel Order
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
                            <p className="text-[10px] text-slate-500">₹{item.price} × {item.qty}</p>
                          </div>
                          <span className="text-xs font-bold text-[#0B3C5D]">₹{item.price * item.qty}</span>
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
  const { orderId } = useParams();
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrderTracking = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('atelimarket_user_token');
      
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
      console.error(err);
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

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
        <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2">
          <span>🚚</span> Delivery Timeline
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
                  {step.status}
                </div>
                <div className={`text-xs ${step.completed ? 'text-slate-600' : 'text-slate-400'}`}>
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

      <div className="bg-white rounded-2xl shadow-md p-6 mb-6 border border-slate-100">
        <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
          <span>📋</span> Order Summary
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

// =============================================
// MAIN APP COMPONENT
// =============================================
export default function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(() => {
    const saved = localStorage.getItem('atelimarket_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState('');
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const [activeBanner, setActiveBanner] = useState(0);
  const banners = [banner1, banner2, banner3];

  // Auth States
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return localStorage.getItem('atelimarket_admin') === 'true';
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const [isUserLoggedIn, setIsUserLoggedIn] = useState(() => {
    return Boolean(localStorage.getItem('atelimarket_user_token'));
  });
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('atelimarket_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [userAuthMode, setUserAuthMode] = useState('login');

  // Registration Fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regStep, setRegStep] = useState('form');
  const [regOtp, setRegOtp] = useState('');
  const [regTimer, setRegTimer] = useState(0);
  const [regResendDisabled, setRegResendDisabled] = useState(false);

  // Login Fields
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
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
      setDeliveryForm(prev => ({
        ...prev,
        phone: String(currentUser?.phone || '').replace(/\D/g, '').slice(-10)
      }));
    }
  }, [checkoutOpen, currentUser?.phone]);
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
  const [pendingPaymentOrders, setPendingPaymentOrders] = useState([]);

  const navigate = useNavigate();
  const location = useLocation();
  const categories = ['All', 'Face Wash'];

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const resetCheckout = () => {
    setCheckoutOpen(false);
    setPaymentMethod('cod');
    setDeliveryForm({
      fullName: currentUser?.name || '',
      phone: String(currentUser?.phone || '').replace(/\D/g, '').slice(-10),
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

  const generateWhatsAppMessage = (orderId, cartItems, total, deliveryCharge, delivery) => {
    const itemsList = cartItems.map((item, index) => {
      let line = `  ${index + 1}. ${item.name} × ${item.qty} = ₹${item.price * item.qty}`;
      if (item.selectedAttributes && Object.keys(item.selectedAttributes).length > 0) {
        const attrs = Object.entries(item.selectedAttributes)
          .filter(([k, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        line += ` (${attrs})`;
      }
      if (item.originalPrice > item.price) {
        line += ` (₹${item.originalPrice} - ${item.discountPercent}% OFF)`;
      }
      return line;
    }).join('\n');

    const totalSavings = cartItems.reduce((sum, item) => {
      return sum + ((item.originalPrice - item.price) * item.qty);
    }, 0);

    return `🏷️ *AteliMarket Order Payment*

🛒 *Order Details:*
${itemsList}

📦 *Total Items:* ${cartItems.length}
💳 *Order Total:* ₹${total}
${deliveryCharge > 0 ? `🚚 *Delivery Charge:* ₹${deliveryCharge}` : '🎉 *Free Delivery*'}
${totalSavings > 0 ? `💰 *You Saved:* ₹${totalSavings}` : ''}

📋 *Order ID:* #${orderId.slice(-8).toUpperCase()}
👤 *Customer:* ${delivery.fullName || 'Guest'}
📱 *Phone:* ${delivery.phone || ''}
📍 *Address:* ${delivery.address || ''}, ${delivery.city || ''}, ${delivery.state || ''} - ${delivery.pincode || ''}

💳 *Payment Details:*
UPI ID: 8901346287@fam
Amount: ₹${total}

📝 Please send payment screenshot after payment.
🙏 Thank you for shopping at AteliMarket!`;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('atelimarket_user_token');
    if (!token) {
      showToast('Please login to place order', 'error');
      setIsAuthModalOpen(true);
      setUserAuthMode('login');
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

    const registeredPhone = String(currentUser?.phone || '').replace(/\D/g, '').slice(-10);
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
        selectedAttributes: item.selectedAttributes || {}
      })),
      total: finalTotal,
      paymentMethod: paymentMethod,
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

    try {
      setPlacingOrder(true);

      const response = await axios.post(`${API_URL}/orders`, orderData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        const orderId = response.data.order._id;

        setCart([]);
        localStorage.removeItem('atelimarket_cart');
        setIsCartOpen(false);
        resetCheckout();
        fetchOrders();

        if (paymentMethod === 'online') {
          showToast('✅ Order placed! Please complete payment via WhatsApp UPI.', 'success');
          const whatsappMessage = generateWhatsAppMessage(orderId, cart, finalTotal, deliveryCharge, deliveryForm);
          window.open(`https://wa.me/918901346287?text=${encodeURIComponent(whatsappMessage)}`, '_blank');
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
      console.error('❌ Order error:', err);
      showToast(err.response?.data?.message || 'Failed to place order. Please try again.', 'error');
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleVerifyPayment = async (orderId) => {
    const token = localStorage.getItem('atelimarket_user_token');
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
      console.error('Error verifying payment:', err);
      showToast(err.response?.data?.message || 'Failed to verify payment', 'error');
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/products`);
      const productsData = res.data?.products || res.data || [];
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      console.error('Error fetching products:', err);
      showToast('Failed to load products', 'error');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchOrders = async () => {
    const token = localStorage.getItem('atelimarket_user_token');
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
      console.error(err);
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
    localStorage.setItem('atelimarket_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    setDeliveryForm(prev => ({
      ...prev,
      fullName: currentUser?.name || prev.fullName || '',
      email: currentUser?.email || prev.email || ''
    }));
  }, [currentUser?.name, currentUser?.email]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode');
    if (mode === 'login' || mode === 'register') {
      setUserAuthMode(mode);
      setIsAuthModalOpen(true);
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

    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    const normalizedPhone = String(regPhone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const normalizedEmail = regEmail.trim().toLowerCase();
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      setError('Please enter a valid 10-digit phone number');
      setLoading(false);
      return;
    }
    if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
      setError('Please enter a valid Gmail address');
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
        showToast('✅ OTP sent to your email!', 'success');
      } else {
        setError(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Register - Step 2: Verify OTP
  const handleVerifyRegistrationOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (regOtp.length < 6) {
      setError('Please enter the 6-digit OTP');
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post(`${AUTH_URL}/verify-registration`, {
        email: regEmail.trim().toLowerCase(),
        otp: regOtp.trim()
      });

      if (res.data.success) {
        const userData = res.data.user;
        setCurrentUser(userData);
        setIsUserLoggedIn(true);
        localStorage.setItem('atelimarket_user', JSON.stringify(userData));
        localStorage.setItem('atelimarket_user_token', res.data.token);
        setRegStep('success');
        setIsAuthModalOpen(false);
        showToast('✅ Registration completed successfully!', 'success');

        setRegName('');
        setRegEmail('');
        setRegPhone('');
        setRegPassword('');
        setRegConfirmPassword('');
        setRegOtp('');
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
  const handleResendRegistrationOTP = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await axios.post(`${AUTH_URL}/resend-registration-otp`, {
        email: regEmail.trim().toLowerCase()
      });

      if (res.data.success) {
        startRegTimer();
        showToast('✅ OTP resent successfully!', 'success');
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
        email: userEmail,
        password: userPassword
      });

      if (res.data.success) {
        const userData = res.data.user;
        setCurrentUser(userData);
        setIsUserLoggedIn(true);
        localStorage.setItem('atelimarket_user', JSON.stringify(userData));
        localStorage.setItem('atelimarket_user_token', res.data.token);
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
    localStorage.removeItem('atelimarket_user');
    localStorage.removeItem('atelimarket_user_token');
    showToast('👋 Logged out', 'info');
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${AUTH_URL}/login`, { email: loginEmail, password: loginPassword });
      if (res.data.success) {
        const userRole = res.data.user?.role;
        if (userRole !== 'admin') {
          showToast('This account is not an admin account.', 'error');
          setLoading(false);
          return;
        }

        setIsAdminLoggedIn(true);
        localStorage.setItem('atelimarket_admin', 'true');
        localStorage.setItem('atelimarket_token', res.data.token);
        localStorage.setItem('atelimarket_user', JSON.stringify(res.data.user));
        localStorage.setItem('atelimarket_user_token', res.data.token);
        setCurrentUser(res.data.user);
        setIsUserLoggedIn(true);
        setShowAdminAuth(false);
        setLoginEmail('');
        setLoginPassword('');
        showToast('🚀 Welcome Admin!', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Login failed', 'error');
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
    localStorage.removeItem('atelimarket_admin');
    localStorage.removeItem('atelimarket_token');
    showToast('👋 Admin Logged out', 'info');
  };

  const handleOrderStatusChange = async (orderId, status) => {
    const token = localStorage.getItem('atelimarket_user_token');
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
      const res = await axios.post(`${API_URL}/products/add`, productData);
      if (res.data.success) {
        setProducts([res.data.product, ...products]);
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
        await axios.delete(`${API_URL}/products/delete/${id}`);
        setProducts(products.filter(p => p._id !== id));
        setCart(cart.filter(item => item._id !== id));
        showToast('🗑️ Product deleted', 'success');
      } catch (err) {
        showToast('Failed to delete', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const addToCart = (product) => {
    if (product.stock <= 0) {
      showToast('Out of stock!', 'error');
      return;
    }
    setCart(prev => {
      const exists = prev.find(item => item._id === product._id);
      if (exists) {
        if (exists.qty >= product.stock) {
          showToast('Not enough stock', 'error');
          return prev;
        }
        return prev.map(item =>
          item._id === product._id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      showToast('✅ Added to cart', 'success');
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, change) => {
    setCart(prev =>
      prev.map(item => {
        if (item._id === id) {
          const newQty = item.qty + change;
          if (newQty > item.stock) {
            showToast('Not enough stock', 'error');
            return item;
          }
          return newQty > 0 ? { ...item, qty: newQty } : null;
        }
        return item;
      }).filter(Boolean)
    );
  };

  const filteredProducts = Array.isArray(products) ? products.filter(product => {
    const matchSearch = product?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        product?.category?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = activeCategory === 'All' ||
      String(product?.category || '').toLowerCase() === activeCategory.toLowerCase();
    return matchSearch && matchCategory;
  }) : [];

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

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 font-sans antialiased flex flex-col">

      {toast.show && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-white font-bold text-sm transition-all ${
          toast.type === 'success' ? 'bg-green-500' :
          toast.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="announcement-bar" role="region" aria-label="VELQRA announcement">
        <div className="announcement-track">
          <div className="announcement-content">
          <span>START SHOPPING WITH VELQRA</span>
          <span className="announcement-star">✦</span>
          <strong>BUY NOW</strong>
          <span className="announcement-star">✦</span>
          <span>PREMIUM QUALITY. EVERYDAY VALUE.</span>
          <span className="announcement-star">✦</span>
          </div>
          <div className="announcement-content" aria-hidden="true">
          <span>START SHOPPING WITH VELQRA</span>
          <span className="announcement-star">✦</span>
          <strong>BUY NOW</strong>
          <span className="announcement-star">✦</span>
          <span>PREMIUM QUALITY. EVERYDAY VALUE.</span>
          <span className="announcement-star">✦</span>
          </div>
        </div>
      </div>
      <header
        className={`site-header sticky top-0 z-40 transition-all duration-300 ${
          isHeaderScrolled
            ? 'is-scrolled shadow-xl'
            : 'shadow-md'
        }`}
        style={{ '--header-logo': `url("${logo}")` }}
      >
        <div className="site-header-inner container mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center justify-between w-full md:w-auto">
            <Link to="/" className="site-header-brand flex items-center gap-3 hover:opacity-90 transition" aria-label="AteliMarket home">
              <img
                src={logo}
                alt="AteliMarket"
                className="h-10 sm:h-12 w-auto max-w-[210px] sm:max-w-[240px] object-contain block"
              />
              <span className="site-header-brand-name">VELQRA<sup className="brand-trademark" aria-label="trademark">TM</sup></span>
            </Link>

            <div className="flex items-center gap-2 md:hidden">
              <button onClick={() => setIsCartOpen(true)} className="relative p-2 bg-white rounded-full hover:bg-slate-100 transition text-[#0B3C5D]">
                <span className="absolute -top-1 -right-1 bg-[#FF5722] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {totalCartItems}
                </span>
                🛒
              </button>
            </div>
          </div>

          <div className="w-full md:w-1/2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search products..."
              className="header-search w-full px-5 py-2.5 rounded-full text-slate-700 placeholder:text-slate-400 text-sm transition-all"
            />
          </div>

          <nav className="flex items-center gap-2 flex-wrap justify-center">
            <div className="flex items-center gap-2">
              {isUserLoggedIn ? (
                <>
                  <Link to="/orders"                   className="header-action text-xs font-bold px-3 py-2 text-[#0B3C5D] rounded-xl transition whitespace-nowrap">
                    📦 Orders
                    {pendingPaymentOrders.length > 0 && (
                      <span className="ml-1 bg-yellow-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {pendingPaymentOrders.length}
                      </span>
                    )}
                  </Link>
                  <button
                    onClick={handleUserLogout}
                    className="header-action header-action-muted text-xs font-bold px-3 py-2 text-slate-700 rounded-xl transition whitespace-nowrap"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setUserAuthMode('login');
                    setRegStep('form');
                    setIsAuthModalOpen(true);
                  }}
                  className="header-action header-login text-xs font-bold px-4 py-2 text-[#0B3C5D] rounded-xl transition whitespace-nowrap flex items-center gap-2"
                >
                  <span>👤</span> Login / Sign Up
                </button>
              )}
            </div>

            <div className="hidden md:flex items-center">
              <button onClick={() => setIsCartOpen(true)} className="header-cart-button relative p-2.5 rounded-full transition cursor-pointer">
                <span className="absolute -top-1 -right-1 bg-[#FF5722] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                  {totalCartItems}
                </span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={
            <>
              <section
                className="banner-carousel relative isolate h-[260px] sm:h-[320px] md:h-[390px] lg:h-[430px] overflow-hidden border-b border-[#dbe6e0] bg-[#071d2b]"
              >
                <img
                  key={banners[activeBanner]}
                  src={banners[activeBanner]}
                  alt={`VELORA featured banner ${activeBanner + 1}`}
                  className="absolute inset-0 h-full w-full object-cover object-center animate-bannerFade"
                  loading={activeBanner === 0 ? 'eager' : 'lazy'}
                />
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#071d2b]/70 px-3 py-2 backdrop-blur-md shadow-lg">
                  {banners.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setActiveBanner(index)}
                      aria-label={`Show banner ${index + 1}`}
                      className={`h-2 rounded-full transition-all ${activeBanner === index ? 'w-7 bg-[#d9b45b]' : 'w-2 bg-white/60 hover:bg-white'}`}
                    />
                  ))}
                </div>
              </section>

              <main className="container mx-auto px-4 py-6 space-y-6">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-5 py-2.5 rounded-full text-xs font-bold transition border whitespace-nowrap cursor-pointer ${
                        activeCategory === cat
                          ? 'bg-[#0B3C5D] text-white border-transparent shadow-md'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-extrabold text-slate-800">
                      {searchQuery ? `🔍 "${searchQuery}"` : activeCategory}
                    </h2>
                    <span className="text-xs text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200">
                      {filteredProducts.length} items
                    </span>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B3C5D]"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {filteredProducts.length === 0 ? (
                        <div className="col-span-full text-center py-16">
                          <div className="text-6xl mb-3">🛍️</div>
                          <p className="text-slate-400 text-sm font-medium">No products found</p>
                        </div>
                      ) : (
                        filteredProducts.map((product) => {
                          const imageUrl = getProductDisplayImage(product);
                          return (
                            <Link
                              key={product._id}
                              to={`/product/${product._id}`}
                              className="group bg-white rounded-2xl border border-slate-100 flex flex-col justify-between p-4 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                            >
                              <div>
                                <div className="h-24 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl flex items-center justify-center overflow-hidden mb-3 group-hover:scale-105 transition-transform relative">
                                  <img
                                    src={imageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-contain bg-white p-1"
                                    loading="lazy"
                                    onError={(e) => {
                                      e.target.onerror = null;
                                      e.target.src = getProductDisplayImage(product);
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                                    <span className="bg-white/90 text-[#0B3C5D] text-[10px] font-bold px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition">
                                      👁️ View
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase block">
                                  {product.category}
                                </span>
                                <h3 className="font-bold text-xs text-slate-800 line-clamp-2 min-h-[32px] mt-0.5 leading-tight">
                                  {product.name}
                                </h3>
                              </div>

                              <div className="mt-3 flex flex-col pt-2 border-t border-slate-50">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <span className="font-black text-sm text-[#0B3C5D]">₹{product.price}</span>
                                  {product.discountPercent > 0 && (
                                    <>
                                      <span className="text-[10px] text-slate-400 line-through">₹{product.originalPrice}</span>
                                      <span className="text-[9px] font-extrabold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                                        -{product.discountPercent}%
                                      </span>
                                    </>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    addToCart(product);
                                  }}
                                  disabled={product.stock <= 0}
                                  className={`w-full mt-2 text-xs font-bold py-2 rounded-lg transition text-center ${
                                    product.stock > 0
                                      ? 'bg-[#FF5722]/10 hover:bg-[#FF5722] text-[#FF5722] hover:text-white'
                                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  }`}
                                >
                                  {product.stock > 0 ? 'Add +' : 'Out of Stock'}
                                </button>
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  )}
                </section>
              </main>
            </>
          } />

          <Route path="/product/:id" element={<ProductDetailPage addToCart={addToCart} />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy-policy" element={<PolicyPage policy="privacy" />} />
          <Route path="/terms-policy" element={<PolicyPage policy="terms" />} />
          <Route path="/return-refund-policy" element={<PolicyPage policy="returns" />} />
          <Route path="/shipping-policy" element={<PolicyPage policy="shipping" />} />
          <Route path="/contact-policy" element={<PolicyPage policy="contact" />} />
          <Route path="/auth" element={<Navigate to="/" />} />

          <Route path="/orders" element={<OrdersPage setIsAuthModalOpen={setIsAuthModalOpen} setUserAuthMode={setUserAuthMode} />} />
          <Route path="/orders/track/:orderId" element={<OrderTracking />} />

          <Route path="/admin" element={
            isAdminLoggedIn ? (
              <main className="container mx-auto max-w-6xl px-4 py-8 space-y-8">
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

                      {/* Icon */}
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Icon</label>
                        <select
                          value={newProdIcon}
                          onChange={(e) => setNewProdIcon(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                        >
                          <option value="📦">📦 Box</option>
                          <option value="🥛">🥛 Dairy</option>
                          <option value="🍞">🍞 Bakery</option>
                          <option value="🥦">🥦 Vegetable</option>
                          <option value="🍎">🍎 Fruit</option>
                          <option value="⚡">⚡ Tech</option>
                          <option value="👕">👕 Fashion</option>
                          <option value="📱">📱 Electronics</option>
                          <option value="👔">👔 Mens</option>
                          <option value="👗">👗 Womens</option>
                          <option value="📚">📚 Books</option>
                          <option value="🏠">🏠 Home & Kitchen</option>
                          <option value="🏅">🏅 Sports</option>
                          <option value="💊">💊 Medicine</option>
                        </select>
                      </div>

                      {/* Attributes */}
                      <div className="border-t border-slate-200 pt-4 mt-2">
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
                          🎯 Product Attributes (Optional)
                        </label>
                        <p className="text-[10px] text-slate-400 mb-2">
                          Add attributes like Color, Size, Storage, RAM, Processor, Fit, Fabric, etc.
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={newAttrKey}
                            onChange={(e) => setNewAttrKey(e.target.value)}
                            placeholder="Attribute Name (e.g., Color)"
                            className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                          <input
                            type="text"
                            value={newAttrValues}
                            onChange={(e) => setNewAttrValues(e.target.value)}
                            placeholder="Values (e.g., Black, White, Blue)"
                            className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={addAttribute}
                          className="w-full mt-2 bg-[#0B3C5D]/10 text-[#0B3C5D] font-bold py-1.5 rounded-lg text-xs hover:bg-[#0B3C5D]/20 transition"
                        >
                          ➕ Add Attribute
                        </button>

                        {Object.keys(newProdAttributes).length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-[10px] font-bold text-slate-500">Added Attributes:</p>
                            {Object.entries(newProdAttributes).map(([key, values]) => (
                              <div key={key} className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                                <div>
                                  <span className="text-xs font-bold text-slate-700">{key}:</span>
                                  <span className="text-xs text-slate-500 ml-1">{values.join(', ')}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAttribute(key)}
                                  className="text-red-400 hover:text-red-600 text-xs font-bold"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
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
              <div className="text-center py-32">
                <div className="text-6xl mb-4">🔒</div>
                <p className="font-bold text-red-500 text-sm">Access Denied!</p>
                <button
                  onClick={() => {
                    setShowAdminAuth(true);
                    setAdminAuthMode('login');
                  }}
                  className="mt-4 bg-[#0B3C5D] text-white font-bold px-6 py-2 rounded-xl text-xs hover:bg-[#07263b] transition"
                >
                  👑 Admin Login
                </button>
              </div>
            )
          } />
        </Routes>
      </div>

      {/* USER AUTH MODAL */}
      {isAuthModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsAuthModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-black font-bold text-lg"
            >
              ✕
            </button>

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
                    type="email"
                    required
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="Email"
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
                      setUserAuthMode('register');
                      setRegStep('form');
                      setError('');
                      setRegName('');
                      setRegEmail('');
                      setRegPhone('');
                      setRegPassword('');
                      setRegConfirmPassword('');
                      setRegOtp('');
                    }}
                    className="font-bold text-[#0B3C5D] hover:underline"
                  >
                    Sign Up
                  </button>
                </div>
              </>
            ) : regStep === 'form' ? (
              // REGISTER - Step 1: Form
              <>
                <h3 className="text-lg font-black text-[#0B3C5D] mb-1">Create Account</h3>
                <p className="text-[11px] text-slate-400 mb-4">Fill details to register. OTP will be sent to your email.</p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSendRegistrationOTP} className="space-y-3">
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Full Name *"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    onBlur={(e) => setRegEmail(e.target.value.trim().toLowerCase())}
                    placeholder="Email *"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="Phone Number (10 digits) *"
                    maxLength="10"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Password (min 6 chars) *"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <input
                    type="password"
                    required
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Confirm Password *"
                    className="w-full bg-slate-50 border px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-[#0B3C5D]"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-sm hover:bg-[#07263b] disabled:opacity-50"
                  >
                    {loading ? '⏳ Sending OTP...' : 'Send OTP'}
                  </button>
                </form>

                <div className="mt-4 text-center text-[10px] text-slate-400">
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setUserAuthMode('login');
                      setError('');
                    }}
                    className="font-bold text-[#0B3C5D] hover:underline"
                  >
                    Sign In
                  </button>
                </div>
              </>
            ) : regStep === 'otp' ? (
              // REGISTER - Step 2: OTP Verification
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl">📧</span>
                  <h3 className="text-lg font-black text-[#0B3C5D]">Verify Email</h3>
                </div>
                <p className="text-[11px] text-slate-400 mb-4">
                  Enter the OTP sent to <strong>{regEmail}</strong>
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl mb-4">
                    {error}
                  </div>
                )}

                <form onSubmit={handleVerifyRegistrationOTP} className="space-y-4">
                  <input
                    type="text"
                    required
                    maxLength="6"
                    value={regOtp}
                    onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    className="w-full bg-slate-50 border px-4 py-3 rounded-xl text-sm text-center text-2xl font-bold tracking-widest focus:outline-none focus:border-[#0B3C5D]"
                  />

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
                    disabled={loading || regOtp.length < 6}
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
        }}
        onBackToLogin={() => {
          setIsForgotPasswordOpen(false);
          setIsAuthModalOpen(true);
          setUserAuthMode('login');
        }}
      />

      {/* ADMIN AUTH MODAL */}
      {showAdminAuth && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
                {adminAuthMode === 'login' ? 'Admin Login' : 'Admin Register'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              {adminAuthMode === 'login'
                ? 'Enter credentials to access admin panel'
                : 'Create your admin account to manage the store'}
            </p>

            <form onSubmit={adminAuthMode === 'login' ? handleAdminLogin : handleAdminRegister} className="space-y-3.5">
              {adminAuthMode === 'register' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                  />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@atelimarket.com"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-xs focus:outline-none focus:border-[#0B3C5D] focus:bg-white transition"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0B3C5D] text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider hover:bg-[#07263b] transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? '⏳ Processing...' : adminAuthMode === 'login' ? '🔑 Login' : '📝 Register'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setAdminAuthMode(adminAuthMode === 'login' ? 'register' : 'login')}
                className="text-[10px] text-[#0B3C5D] font-bold hover:underline"
              >
                {adminAuthMode === 'login'
                  ? "Don't have an admin account? Register"
                  : '← Back to Login'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CART SIDEBAR */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-50 flex justify-end backdrop-blur-sm"
          onClick={() => setIsCartOpen(false)}
        >
          <div
            className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <h2 className="text-lg font-black text-[#0B3C5D]">🛒 Cart</h2>
                <button onClick={() => setIsCartOpen(false)} className="text-gray-400 hover:text-black font-bold text-lg">
                  ✕
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="text-6xl mb-4">🛍️</div>
                  <p className="text-slate-400 text-sm font-medium">Cart is empty</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {cart.map(item => (
                    <div key={item._id} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-xl hover:shadow-sm transition">
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
                          <p className="text-[11px] text-slate-400">₹{item.price} × {item.qty}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 flex-shrink-0">
                        <button onClick={() => updateQty(item._id, -1)} className="px-2 py-0.5 font-bold text-slate-400 hover:text-[#FF5722] text-xs transition">−</button>
                        <span className="text-xs font-bold w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item._id, 1)} className="px-2 py-0.5 font-bold text-slate-400 hover:text-[#0B3C5D] text-xs transition">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-3 flex-shrink-0">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-bold">₹{totalCartPrice}</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Delivery Charge</span>
                  <span className={`font-bold ${deliveryCharge === 0 ? 'text-green-600' : 'text-[#FF5722]'}`}>
                    {deliveryCharge === 0 ? '🎉 Free' : `₹${deliveryCharge}`}
                  </span>
                </div>

                {deliveryCharge === 0 && (
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-green-600 font-bold">
                      🎉 Free delivery! (Order above ₹199)
                    </p>
                  </div>
                )}

                {deliveryCharge > 0 && (
                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-slate-500">
                      Add ₹{199 - totalCartPrice} more for free delivery 🚚
                    </p>
                  </div>
                )}

                {totalSavings > 0 && (
                  <div className="flex justify-between items-center text-xs text-green-600">
                    <span>💰 You saved</span>
                    <span className="font-bold">₹{totalSavings}</span>
                  </div>
                )}

                <div className="flex justify-between items-center font-bold text-sm pt-2 border-t border-slate-100">
                  <span className="text-slate-600">Grand Total:</span>
                  <span className="text-[#0B3C5D] text-lg font-black">₹{grandTotal}</span>
                </div>
                {checkoutOpen ? (
                  <form onSubmit={handlePlaceOrder} className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                    {/* Delivery Form */}
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Delivery Details</p>
                      <div className="grid gap-2">
                        <input
                          required
                          value={deliveryForm.fullName}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="Full Name *"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <input
                          required
                          value={deliveryForm.phone}
                          readOnly
                          title="Registered phone number cannot be changed"
                          placeholder="Phone Number *"
                          className="w-full bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-600 cursor-not-allowed"
                        />
                        <input
                          required={paymentMethod === 'cod'}
                          type="tel"
                          value={deliveryForm.alternatePhone}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, alternatePhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          placeholder={`Alternate Phone Number${paymentMethod === 'cod' ? ' *' : ''}`}
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <input
                          type="email"
                          value={deliveryForm.email}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="Email"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <textarea
                          required
                          value={deliveryForm.address}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, address: e.target.value }))}
                          placeholder="Complete Address *"
                          rows="2"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <input
                          value={deliveryForm.landmark}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, landmark: e.target.value }))}
                          placeholder="Landmark (optional)"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            required
                            value={deliveryForm.city}
                            onChange={(e) => setDeliveryForm(prev => ({ ...prev, city: e.target.value }))}
                            placeholder="City *"
                            className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                          <input
                            required
                            value={deliveryForm.state}
                            onChange={(e) => setDeliveryForm(prev => ({ ...prev, state: e.target.value }))}
                            placeholder="State *"
                            className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                          />
                        </div>
                        <input
                          required
                          value={deliveryForm.pincode}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, pincode: e.target.value }))}
                          placeholder="Pincode *"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-[#0B3C5D]"
                        />
                        <textarea
                          value={deliveryForm.note}
                          onChange={(e) => setDeliveryForm(prev => ({ ...prev, note: e.target.value }))}
                          placeholder="Delivery note (optional)"
                          rows="2"
                          className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm resize-none focus:outline-none focus:border-[#0B3C5D]"
                        />
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                      <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">Payment Method</p>
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
                          💵 Cash on Delivery
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod('online')}
                          className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                            paymentMethod === 'online'
                              ? 'bg-[#25D366] text-white shadow-md'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex items-center justify-center gap-1">
                            <span>📱</span> WhatsApp Pay
                          </span>
                        </button>
                      </div>

                      {paymentMethod === 'online' && (
                        <div className="mt-3 space-y-2">
                          <div className="rounded-xl border border-dashed border-[#25D366] bg-white p-3 text-center">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Pay via WhatsApp UPI</p>
                            <img
                              src={`https://chart.googleapis.com/chart?cht=qr&chs=250x250&chl=upi://pay?pa=8901346287@fam&pn=AteliMarket&am=${grandTotal}&cu=INR&tn=AteliMarket%20Order`}
                              alt="WhatsApp UPI QR"
                              className="mx-auto my-2 w-36 h-36"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi://pay?pa=8901346287@fam&am=${grandTotal}&cu=INR`;
                              }}
                            />

                            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                              <p className="text-xs font-bold text-[#25D366]">📱 WhatsApp Number</p>
                              <p className="text-sm font-black text-slate-800">8901346287</p>
                              <p className="text-[10px] text-slate-500 mt-1">
                                Send ₹{grandTotal} to this WhatsApp UPI ID
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                const tempOrderId = 'ORDER-' + Date.now().toString(36).toUpperCase();
                                const message = generateWhatsAppMessage(tempOrderId, cart, grandTotal, deliveryCharge, deliveryForm);
                                window.open(`https://wa.me/918901346287?text=${encodeURIComponent(message)}`, '_blank');
                              }}
                              className="w-full bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white font-bold py-3 rounded-xl text-sm hover:from-[#128C7E] hover:to-[#075E54] transition text-center flex items-center justify-center gap-2 shadow-md mt-3"
                            >
                              <span>💬</span> Pay via WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="submit"
                        disabled={placingOrder}
                        className={`w-full font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 ${
                          paymentMethod === 'online'
                            ? 'bg-[#25D366] text-white hover:bg-[#128C7E]'
                            : 'bg-[#FF5722] text-white hover:bg-[#e64a19]'
                        } ${placingOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {placingOrder ? (
                          <>
                            <span className="animate-spin">⏳</span> Processing...
                          </>
                        ) : (
                          <>
                            {paymentMethod === 'online' ? `📱 Pay ₹${grandTotal} via WhatsApp & Confirm` : `📦 Place Order (₹${grandTotal})`}
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={resetCheckout}
                        className="w-full bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl text-sm hover:bg-slate-200 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setCheckoutOpen(true)}
                    className="w-full bg-[#FF5722] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-[#e64a19] transition shadow-md"
                  >
                    ✅ Proceed to Checkout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="site-footer mt-auto">
        <div className="container mx-auto px-4 pt-10 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-8 md:gap-12">
            <div>
              <Link to="/" className="footer-brand inline-flex items-center gap-3" aria-label="AteliMarket home">
                <img src={logo} alt="AteliMarket" className="h-11 w-auto max-w-[210px] object-contain rounded-lg" />
                <span className="footer-brand-name">VELQRA<sup className="brand-trademark" aria-label="trademark">TM</sup></span>
              </Link>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
                Thoughtfully selected products, simple shopping and dependable delivery for your everyday needs.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <a href="https://instagram.com/officialvelqra" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-[#FF5722] hover:text-[#FF5722]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>
                </a>
                <a href="https://facebook.com/officialvelqra" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-[#1877F2] hover:text-[#1877F2]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M14 8h3V4h-3c-3 0-5 2-5 5v2H6v4h3v5h4v-5h3l1-4h-4V9c0-.6.4-1 1-1z"/></svg>
                </a>
                <a href="https://youtube.com/officialvelqra" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-[#FF0000] hover:text-[#FF0000]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M23 12s0-3.4-.4-4.9a2.8 2.8 0 0 0-2-2C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.6.4a2.8 2.8 0 0 0-2 2C1 8.6 1 12 1 12s0 3.4.4 4.9a2.8 2.8 0 0 0 2 2c1.7.4 8.6.4 8.6.4s6.9 0 8.6-.4a2.8 2.8 0 0 0 2-2C23 15.4 23 12 23 12zM9.7 15.4V8.6L15.9 12l-6.2 3.4z"/></svg>
                </a>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Explore</h2>
              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600">
                <Link to="/about" className="w-fit hover:text-[#0B3C5D] transition">About Us</Link>
                <Link to="/orders" className="w-fit hover:text-[#0B3C5D] transition">Track Your Order</Link>
                <a href="mailto:gs8901346287@gmail.com" className="w-fit hover:text-[#0B3C5D] transition">Contact Support</a>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Policies</h2>
              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-600">
                <Link to="/privacy-policy" className="w-fit hover:text-[#0B3C5D] transition">Privacy Policy</Link>
                <Link to="/terms-policy" className="w-fit hover:text-[#0B3C5D] transition">Terms & Conditions</Link>
                <Link to="/return-refund-policy" className="w-fit hover:text-[#0B3C5D] transition">Return & Refund Policy</Link>
                <Link to="/shipping-policy" className="w-fit hover:text-[#0B3C5D] transition">Shipping Policy</Link>
                <Link to="/contact-policy" className="w-fit hover:text-[#0B3C5D] transition">Contact Policy</Link>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500">
            <span>© 2026 AteliMarket. All rights reserved.</span>
            <span>Secure shopping • Easy returns • Trusted support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
