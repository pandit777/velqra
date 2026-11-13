const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const axios = require('axios');
const multer = require('multer');
const crypto = require('crypto');
const { Resend } = require('resend');
const { generateInvoicePdf } = require('./utils/invoice');

dotenv.config();

// =============================================
// PAYU CONFIG
// =============================================
const payuKey = process.env.PAYU_MERCHANT_KEY;
const payuSalt = process.env.PAYU_SALT;
const payuBaseUrl = process.env.PAYU_BASE_URL || 'https://secure.payu.in/_payment';
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');
const payuSuccessUrl = process.env.PAYU_SUCCESS_URL || `${backendUrl}/api/payment/payu/callback`;
const payuFailureUrl = process.env.PAYU_FAILURE_URL || `${backendUrl}/api/payment/payu/callback`;
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:10000').replace(/\/+$/, '');
const metaPixelId = process.env.META_PIXEL_ID || '';
const metaAccessToken = process.env.META_ACCESS_TOKEN || '';
const metaGraphApiVersion = process.env.META_GRAPH_API_VERSION || 'v22.0';
const metaTestEventCode = process.env.META_TEST_EVENT_CODE || '';
const metaCapiConfigured = /^\d+$/.test(metaPixelId) &&
  Boolean(metaAccessToken) && /^v\d+\.\d+$/.test(metaGraphApiVersion);
const parseConfiguredUrl = (name, value) => {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
};
const frontendOrigin = parseConfiguredUrl('FRONTEND_URL', frontendUrl).origin;
if (process.env.NODE_ENV === 'production') {
  const parsedBackendUrl = parseConfiguredUrl('BACKEND_URL', backendUrl);
  const callbackUrls = [
    ['PAYU_SUCCESS_URL', payuSuccessUrl],
    ['PAYU_FAILURE_URL', payuFailureUrl]
  ].map(([name, value]) => [name, parseConfiguredUrl(name, value)]);
  const paymentUrl = parseConfiguredUrl('PAYU_BASE_URL', payuBaseUrl);
  const errors = [];

  if (parseConfiguredUrl('FRONTEND_URL', frontendUrl).protocol !== 'https:') {
    errors.push('FRONTEND_URL must use HTTPS');
  }
  if (parsedBackendUrl.protocol !== 'https:') {
    errors.push('BACKEND_URL must use HTTPS');
  }
  for (const [name, url] of callbackUrls) {
    if (url.protocol !== 'https:') errors.push(`${name} must use HTTPS`);
    if (url.origin !== parsedBackendUrl.origin) errors.push(`${name} must use the BACKEND_URL origin`);
    if (url.pathname !== '/api/payment/payu/callback' || url.search || url.hash) {
      errors.push(`${name} must be /api/payment/payu/callback without query or fragment`);
    }
  }
  if (paymentUrl.protocol !== 'https:' ||
      !['secure.payu.in', 'test.payu.in'].includes(paymentUrl.hostname) ||
      paymentUrl.pathname !== '/_payment' || paymentUrl.search || paymentUrl.hash) {
    errors.push('PAYU_BASE_URL must be the trusted HTTPS PayU payment endpoint');
  }
  if (errors.length) {
    throw new Error(`Invalid production URL configuration: ${errors.join('; ')}`);
  }
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const createRateLimiter = ({ windowMs, max, keyGenerator = req => req.ip || req.socket.remoteAddress }) => {
  const requests = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of requests) {
      if (bucket.resetAt <= now) requests.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanup.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req));
    let bucket = requests.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      requests.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
    }
    next();
  };
};

const apiRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 600 });
const authRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const otpRequestRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const otpVerifyRateLimit = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
const getOtpRateLimitIdentity = req => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
  const identity = phone || String(req.body?.email || req.userId || req.body?.orderId || '')
    .trim().toLowerCase().slice(0, 254);
  return `otp-target:${identity || req.ip}`;
};
const otpTargetRequestRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: getOtpRateLimitIdentity
});
const otpTargetVerifyRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: getOtpRateLimitIdentity
});
const noStore = (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  next();
};

// =============================================
// ENV
// =============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || '';
const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
const legacyAdminPassword = process.env.LEGACY_ADMIN_PASSWORD || '';

const fast2smsApiKey = process.env.FAST2SMS_API_KEY;
const smsTestMode = process.env.NODE_ENV !== 'production' &&
  (process.env.SMS_TEST_MODE || 'true').toLowerCase() === 'true';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailTestMode = process.env.NODE_ENV !== 'production' &&
  (process.env.EMAIL_TEST_MODE || 'true').toLowerCase() === 'true' && !resend;
const smsTestNumbers = (process.env.SMS_TEST_NUMBERS || '')
  .split(',')
  .map(n => String(n).replace(/\D/g, '').slice(-10))
  .filter(n => /^[6-9]\d{9}$/.test(n));

console.log('🚀 Starting VELQRA Backend...');
console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔗 Supabase: ${supabaseUrl ? '✅' : '❌'}`);
console.log(`📱 Fast2SMS: ${fast2smsApiKey ? '✅' : '❌'}`);
console.log(`🧪 SMS Test Mode: ${smsTestMode ? 'ON' : 'OFF'}`);
console.log(`📱 SMS Whitelist entries: ${smsTestNumbers.length}`);
console.log(`✉️ Email OTP: ${resend ? 'Resend configured' : emailTestMode ? 'Local test mode' : 'Not configured'}`);
console.log(`💳 PayU: ${payuKey ? '✅' : '❌'}`);
console.log(`📊 Meta Conversions API: ${metaCapiConfigured ? 'configured' : 'not configured'}`);

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Supabase credentials missing');
  process.exit(1);
}
if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  console.error('❌ JWT_SECRET must contain at least 32 characters');
  process.exit(1);
}
if (Buffer.byteLength(initialAdminPassword, 'utf8') < 16 ||
    Buffer.byteLength(initialAdminPassword, 'utf8') > 72) {
  console.error('❌ INITIAL_ADMIN_PASSWORD must contain 16-72 bytes');
  process.exit(1);
}
if (legacyAdminPassword && (Buffer.byteLength(legacyAdminPassword, 'utf8') > 72 ||
    legacyAdminPassword === initialAdminPassword)) {
  console.error('❌ LEGACY_ADMIN_PASSWORD is invalid');
  process.exit(1);
}

// =============================================
// SUPABASE
// =============================================
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 }, transport: { WebSocket } }
});
console.log('✅ Supabase initialized');

const ensureBootstrapAdmin = async () => {
  const { data: admin, error: lookupError } = await supabase
    .from('admins')
    .select('id, password')
    .eq('email', 'admin')
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (admin) {
    if (legacyAdminPassword && await bcrypt.compare(legacyAdminPassword, admin.password)) {
      const { error: migrationError } = await supabase
        .from('admins')
        .update({ password: await bcrypt.hash(initialAdminPassword, 12) })
        .eq('id', admin.id);
      if (migrationError) throw migrationError;
      console.log('Legacy bootstrap admin credential rotated; password change is required.');
    }
    return;
  }

  const { error: insertError } = await supabase
    .from('admins')
    .insert({
      email: 'admin',
      password: await bcrypt.hash(initialAdminPassword, 12)
    });

  if (insertError && insertError.code !== '23505') throw insertError;
  if (insertError) {
    const { data: existingAdmin, error: retryError } = await supabase
      .from('admins')
      .select('id')
      .eq('email', 'admin')
      .maybeSingle();
    if (retryError || !existingAdmin) throw retryError || insertError;
    return;
  }

  console.log('✅ Initial admin account created; password change is required before storefront access.');
};

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
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
const matchesOtp = (expectedHash, suppliedOtp) => {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) return false;
  const expected = Buffer.from(expectedHash, 'hex');
  const supplied = Buffer.from(hashOtp(suppliedOtp), 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
};
const matchesHash = (expectedHash, suppliedHash) => {
  if (!/^[a-f0-9]{128}$/i.test(String(expectedHash || '')) ||
      !/^[a-f0-9]{128}$/i.test(String(suppliedHash || ''))) return false;
  const expected = Buffer.from(expectedHash, 'hex');
  const supplied = Buffer.from(suppliedHash, 'hex');
  return crypto.timingSafeEqual(expected, supplied);
};

async function sendRegistrationEmail(email, otp, name) {
  if (!resend) {
    if (emailTestMode) return { sent: false, testMode: true };
    return { sent: false, reason: 'email_provider_not_configured' };
  }

  const from = process.env.EMAIL_FROM;
  if (!from) return { sent: false, reason: 'email_sender_not_configured' };

  const { error } = await resend.emails.send({
    from,
    to: [email],
    subject: 'Verify your AteliMarket account',
    text: `Hello ${name}, your AteliMarket verification code is ${otp}. It expires in 10 minutes. Do not share it with anyone.`
  });
  if (error) {
    console.error('Registration email delivery failed:', error.message);
    return { sent: false, reason: 'email_delivery_failed' };
  }
  return { sent: true };
}

async function sendFast2SMS(phoneNumber, otpCode, name = 'User') {
  const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    return { sent: false, reason: 'invalid_phone' };
  }

  // Test-mode codes are returned only to non-production callers.
  if (smsTestMode && !smsTestNumbers.includes(normalizedPhone)) {
    return { sent: false, reason: 'test_mode_skip', otp: otpCode };
  }

  if (!fast2smsApiKey) {
    console.error('❌ Fast2SMS API key missing');
    return { sent: false, reason: 'no_api_key' };
  }

  try {
    const message = `Aapka VELQRA OTP code ${otpCode} hai. Valid 10 min. Kisi ke sath share na karein.`;
    const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        route: 'q',
        message,
        language: 'english',
        flash: 0,
        numbers: normalizedPhone,
      },
      headers: { authorization: fast2smsApiKey },
      timeout: 15000,
    });

    if (response.data?.return === true) {
      return { sent: true, reason: 'success' };
    }

    console.error('Fast2SMS rejected the OTP request');
    return { sent: false, reason: 'api_error' };
  } catch (error) {
    console.error('❌ Fast2SMS EXCEPTION:', {
      status: error.response?.status,
      code: error.code
    });
    return { sent: false, reason: 'exception' };
  }
}

// =============================================
// CORS
// =============================================
const allowedOrigins = [
  'https://atelimarket.shop',
  'https://www.atelimarket.shop',
  frontendOrigin,
  'https://atelimarket-frontend-xzjb.onrender.com'
].concat((process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(origin => {
    if (!origin) return false;
    try {
      const parsed = new URL(origin);
      return process.env.NODE_ENV !== 'production' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }));
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push(
    'http://localhost:5173', 'http://localhost:3000',
    'http://localhost:5000', 'http://localhost:10000'
  );
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) cb(null, true);
    else {
      const error = new Error('Not allowed by CORS');
      error.status = 403;
      cb(error);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use('/api', apiRateLimit, noStore);
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// =============================================
// STATIC + VIDEO UPLOAD
// =============================================
const uploadsDir = path.join(__dirname, 'uploads');
const reviewsDir = path.join(uploadsDir, 'reviews');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(reviewsDir)) fs.mkdirSync(reviewsDir, { recursive: true });

app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=31536000');
  }
}));

const allowedVideoTypes = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ['video/ogg', '.ogv']
]);
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, reviewsDir),
  filename: (req, file, cb) => cb(null, `review_${crypto.randomUUID()}${allowedVideoTypes.get(file.mimetype)}`)
});
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedVideoTypes.has(file.mimetype)) return cb(null, true);
    const error = new Error('Only supported video files are allowed');
    error.status = 400;
    cb(error);
  }
});

console.log(`📁 Uploads: ${uploadsDir}`);

// =============================================
// MIDDLEWARE
// =============================================
const requireAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid admin session' });
  }

  if (!decoded.userId || decoded.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }

  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, email, role, password')
      .eq('id', decoded.userId)
      .maybeSingle();

    if (error) throw error;
    if (!admin || (admin.role && admin.role !== 'admin')) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const passwordChangeRequired = await bcrypt.compare(initialAdminPassword, admin.password);
    const isPasswordSetupRequest = req.method === 'PUT' && req.path === '/api/admin/password';
    if (passwordChangeRequired && !isPasswordSetupRequest) {
      return res.status(403).json({ success: false, message: 'Change the initial admin password first' });
    }

    req.adminUser = admin;
    return next();
  } catch (error) {
    return next(error);
  }
};

app.get('/api/admin/setup-status', async (req, res) => {
  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('password')
      .eq('email', 'admin')
      .maybeSingle();

    if (error) throw error;
    if (!admin) {
      return res.status(503).json({ success: false, message: 'Admin account is not available' });
    }

    const passwordChangeRequired = await bcrypt.compare(initialAdminPassword, admin.password);
    res.json({ success: true, ready: !passwordChangeRequired });
  } catch (error) {
    console.error('Admin setup status error:', error.code || 'database error');
    res.status(500).json({ success: false, message: 'Could not check admin setup status' });
  }
});

app.put('/api/admin/password', requireAdmin, async (req, res) => {
  try {
    const admin = req.adminUser;
    if (!admin) return res.status(403).json({ success: false, message: 'Admin access required' });

    const { newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || Buffer.byteLength(newPassword, 'utf8') < 12 ||
        Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'New password must be 12-72 bytes long' });
    }
    if (await bcrypt.compare(newPassword, admin.password)) {
      return res.status(400).json({ success: false, message: 'Choose a password different from your current password' });
    }

    const { error: updateError } = await supabase
      .from('admins')
      .update({ password: await bcrypt.hash(newPassword, 12), updated_at: new Date().toISOString() })
      .eq('id', admin.id);

    if (updateError) throw updateError;
    res.json({ success: true, message: 'Admin password updated' });
  } catch (error) {
    console.error('Admin password update error:', error.code || 'database error');
    res.status(500).json({ success: false, message: 'Could not update admin password' });
  }
});

const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, jwtSecret);
    if (!decoded.userId) return res.status(401).json({ success: false, message: 'Invalid session' });
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid session' });
  }
};

// =============================================
// HELPERS
// =============================================
const formatUser = (user) => {
  if (!user) return null;
  return {
    id: user.id, name: user.name || 'User', email: user.email,
    phone: user.phone || '', role: user.role || 'user',
    isVerified: user.is_verified || false, createdAt: user.created_at || user.createdAt
  };
};

const formatProduct = (product) => {
  if (!product) return null;
  return {
    _id: product.id, id: product.id,
    name: product.name || 'Product', price: product.price || 0,
    originalPrice: product.original_price || 0,
    discountPercent: product.discount_percent || 0,
    category: product.category || 'Uncategorized', stock: product.stock || 10,
    description: product.description || '',
    image: product.image || '', imageUrl: product.image_url || '',
    images: product.images || [], brand: product.brand || '',
    weight: product.weight || null, dimensions: product.dimensions || null,
    color: product.color || '', size: product.size || '',
    material: product.material || '', warranty: product.warranty || '',
    tags: product.tags || [], icon: product.icon || '📦',
    rating: product.rating || 0, reviewsCount: product.reviews_count || 0,
    popularity: product.popularity || 0,
    promoCode: product.promo_code || '', promoDiscount: Number(product.promo_discount || 0),
    isActive: product.is_active !== false,
    createdAt: product.created_at, updatedAt: product.updated_at,
    mainImage: product.image || product.image_url || (product.images && product.images.length > 0 ? product.images[0] : ''),
    videoUrl: product.video_url || null, videoType: product.video_type || 'youtube',
    attributes: product.attributes || {}
  };
};

const formatCartItem = (item) => ({
  productId: item.product_id, name: item.name, price: item.price,
  originalPrice: item.original_price || 0, discountPercent: item.discount_percent || 0,
  qty: item.qty, image: item.image || '', imageUrl: item.image_url || '',
  stock: item.stock || 0, category: item.category || '',
  selectedAttributes: item.selected_attributes || {},
  promoApplied: item.promo_applied === true,
  promoCode: item.promo_code || ''
});

const normalizeCartAttributes = (attributes = {}) => Object.fromEntries(
  Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))
);

const getCartLineKey = (item) => JSON.stringify([
  String(item.product_id || item.productId || item._id || ''),
  normalizeCartAttributes(item.selected_attributes || item.selectedAttributes || {}),
  String(item.promo_code || item.promoCode || '').trim().toUpperCase()
]);

const formatCart = (cart) => {
  if (!cart) return { items: [], totalItems: 0, totalPrice: 0, totalSavings: 0, updatedAt: new Date().toISOString() };
  const items = cart.items?.map(formatCartItem) || [];
  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = items.reduce((s, i) => s + (i.price * i.qty), 0);
  const totalSavings = items.reduce((s, i) => s + ((i.originalPrice - i.price) * i.qty), 0);
  return { items, totalItems, totalPrice, totalSavings, updatedAt: cart.updated_at || new Date().toISOString() };
};

const formatOrder = (order, includeAttribution = false) => {
  if (!order) return null;
  const formattedOrder = {
    _id: order.id, id: order.id, userId: order.user_id,
    userName: order.user_name || 'Guest', userEmail: order.user_email || '',
    items: order.items || [], total: order.total,
    paymentMethod: order.payment_method || 'cod',
    referenceId: order.reference_id || null, delivery: order.delivery || {},
    status: order.status || 'Pending', statusHistory: order.status_history || [],
    createdAt: order.created_at, updatedAt: order.updated_at
  };
  if (includeAttribution) {
    const firstTouch = sanitizeAttributionTouch(order.attribution?.firstTouch);
    const lastTouch = sanitizeAttributionTouch(order.attribution?.lastTouch);
    formattedOrder.attribution = {
      ...(firstTouch ? { firstTouch } : {}),
      ...(lastTouch ? { lastTouch } : {})
    };
  }
  return formattedOrder;
};

const sanitizeAttributionTouch = (touch) => {
  if (!touch || typeof touch !== 'object' || Array.isArray(touch)) return null;
  const allowedFields = ['source', 'medium', 'campaign', 'term', 'content', 'campaignId'];
  const sanitized = {};
  for (const field of allowedFields) {
    if (typeof touch[field] !== 'string') continue;
    const value = touch[field].replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 256);
    if (value) sanitized[field] = value;
  }
  if (typeof touch.landingPath === 'string') {
    const landingPath = touch.landingPath.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 512);
    if (landingPath.startsWith('/') && !landingPath.startsWith('//')) {
      sanitized.landingPath = landingPath;
    }
  }
  if (typeof touch.capturedAt === 'string' && Number.isFinite(Date.parse(touch.capturedAt))) {
    sanitized.capturedAt = new Date(touch.capturedAt).toISOString();
  }
  return Object.keys(sanitized).length ? sanitized : null;
};

const sanitizeOrderAttribution = (attribution) => {
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) return {};
  const sanitized = {};
  const firstTouch = sanitizeAttributionTouch(attribution.firstTouch);
  const lastTouch = sanitizeAttributionTouch(attribution.lastTouch);
  if (firstTouch) sanitized.firstTouch = firstTouch;
  if (lastTouch) sanitized.lastTouch = lastTouch;

  const fbp = String(attribution.fbp || '').trim().slice(0, 256);
  const fbc = String(attribution.fbc || '').trim().slice(0, 512);
  if (/^fb\.\d+\.\d+\.\d+$/.test(fbp)) sanitized.fbp = fbp;
  if (/^fb\.\d+\.\d+\.[A-Za-z0-9._-]{1,256}$/.test(fbc)) sanitized.fbc = fbc;
  return sanitized;
};

const hashMetaValue = value => crypto.createHash('sha256').update(value).digest('hex');
const sendMetaPurchaseEvent = async (order) => {
  if (!metaCapiConfigured || !order?.marketing_consent) return;
  try {
    const delivery = order.delivery || {};
    const email = String(order.user_email || delivery.email || '').trim().toLowerCase();
    const phoneDigits = String(delivery.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const userData = {};
    if (email) userData.em = [hashMetaValue(email)];
    if (/^[6-9]\d{9}$/.test(phoneDigits)) userData.ph = [hashMetaValue(`91${phoneDigits}`)];
    if (order.user_id) userData.external_id = [hashMetaValue(String(order.user_id))];

    const attribution = sanitizeOrderAttribution(order.attribution);
    if (attribution.fbp) userData.fbp = attribution.fbp;
    if (attribution.fbc) userData.fbc = attribution.fbc;

    const eventUrl = new URL(frontendUrl);
    const touch = attribution.lastTouch || attribution.firstTouch || {};
    eventUrl.pathname = touch.landingPath || '/';
    const utmParameters = {
      source: 'utm_source',
      medium: 'utm_medium',
      campaign: 'utm_campaign',
      term: 'utm_term',
      content: 'utm_content',
      campaignId: 'utm_id'
    };
    for (const [field, parameter] of Object.entries(utmParameters)) {
      if (touch[field]) eventUrl.searchParams.set(parameter, touch[field]);
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const event = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(order.id),
      action_source: 'website',
      event_source_url: eventUrl.toString(),
      user_data: userData,
      custom_data: {
        currency: 'INR',
        value: Number(order.total),
        order_id: String(order.id),
        content_type: 'product',
        content_ids: items.map(item => String(item.product_id)).filter(Boolean),
        contents: items.map(item => ({
          id: String(item.product_id),
          quantity: Number(item.qty),
          item_price: Number(item.price)
        }))
      }
    };
    const payload = { data: [event] };
    if (metaTestEventCode) payload.test_event_code = metaTestEventCode;
    const response = await axios.post(
      `https://graph.facebook.com/${metaGraphApiVersion}/${metaPixelId}/events`,
      payload,
      {
        timeout: 5000,
        headers: { Authorization: `Bearer ${metaAccessToken}` }
      }
    );
    if (!response.data || response.data.events_received !== 1) {
      console.error('Meta Conversions API did not accept the Purchase event');
    }
  } catch (error) {
    console.error('Meta Purchase event delivery failed:', {
      status: error.response?.status,
      code: error.code
    });
  }
};

const calculateDeliveryCharge = (subtotal) => subtotal >= 199 ? 0 : 20;

// =============================================
// RETURN HELPERS
// =============================================
const formatBankDetails = (b) => {
  if (!b) return null;
  return {
    accountHolderName: b.account_holder_name,
    accountNumber: b.account_number,
    ifscCode: b.ifsc_code,
    bankName: b.bank_name,
    upiId: b.upi_id || null,
    updatedAt: b.updated_at
  };
};

const formatReturnRequest = (r) => {
  if (!r) return null;
  return {
    id: r.id,
    orderId: r.order_id,
    userId: r.user_id,
    items: r.items || [],
    reason: r.reason,
    description: r.description || '',
    bankDetails: r.bank_details_snapshot || null,
    refundAmount: r.refund_amount,
    status: r.status,
    adminNote: r.admin_note || '',
    statusHistory: r.status_history || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
};

const RETURN_REASONS = [
  'Damaged product',
  'Wrong item received',
  'Product not as described',
  'Quality issue',
  'Size/fit issue',
  'Changed my mind',
  'Other'
];

// =============================================
// AUTH ROUTES
// =============================================
app.use('/api/auth', authRateLimit, noStore);

app.post('/api/auth/register', otpRequestRateLimit, otpTargetRequestRateLimit, async (req, res) => {
  try {
    const { name, phone, password, confirmPassword } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    const normalizedPhone = String(phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');

    if (!cleanName || !phone || !email ||
      typeof password !== 'string' || typeof confirmPassword !== 'string') {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    if (cleanName.length > 100 || !isValidGmailAddress(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid Gmail address ending in @gmail.com' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'Password must be 8-72 characters long' });
    }
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({ success: false, message: 'Valid 10-digit phone required' });
    }
    if (!resend && !emailTestMode) {
      return res.status(503).json({ success: false, message: 'Email verification is temporarily unavailable' });
    }
    if (!fast2smsApiKey && !smsTestMode) {
      return res.status(503).json({ success: false, message: 'Mobile verification is temporarily unavailable' });
    }

    const { data: existingPhoneUser, error: phoneLookupError } = await supabase
      .from('users').select('id').eq('phone', normalizedPhone).maybeSingle();
    if (phoneLookupError) throw phoneLookupError;
    if (existingPhoneUser) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }
    const { data: existingEmailUser, error: emailLookupError } = await supabase
      .from('users').select('id').ilike('email', email).maybeSingle();
    if (emailLookupError) throw emailLookupError;
    if (existingEmailUser) {
      return res.status(400).json({ success: false, message: 'Email address already registered' });
    }

    const { data: pendingRegistration, error: pendingLookupError } = await supabase
      .from('registration_otps').select('created_at').eq('email', normalizedPhone).maybeSingle();
    if (pendingLookupError) throw pendingLookupError;
    if (pendingRegistration && Date.now() - new Date(pendingRegistration.created_at).getTime() < 60_000) {
      return res.status(429).json({ success: false, message: 'Please wait before requesting another verification code' });
    }

    const smsOtp = String(crypto.randomInt(100000, 1000000));
    const emailOtp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 12);
    const { error: otpError } = await supabase.from('registration_otps').upsert({
      email: normalizedPhone,
      otp: hashOtp(smsOtp),
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      data: {
        name: cleanName,
        email,
        phone: normalizedPhone,
        passwordHash,
        emailOtpHash: hashOtp(emailOtp),
        attempts: 0,
        lastSentAt: new Date().toISOString()
      }
    }, { onConflict: 'email' });

    if (otpError) return res.status(500).json({ success: false, message: 'Failed to generate OTP' });

    const emailResult = await sendRegistrationEmail(email, emailOtp, cleanName);
    if (!emailResult.sent) {
      await supabase.from('registration_otps').delete().eq('email', normalizedPhone);
      console.error('Registration email verification unavailable:', emailResult.reason);
      return res.status(502).json({ success: false, message: 'Could not send email verification code. Please try again later.' });
    }

    const smsResult = await sendFast2SMS(normalizedPhone, smsOtp, cleanName);
    if (!smsResult.sent && smsResult.reason !== 'test_mode_skip') {
      await supabase.from('registration_otps').delete().eq('email', normalizedPhone);
      return res.status(502).json({ success: false, message: 'Could not send mobile verification code. Please try again later.' });
    }

    const response = {
      success: true,
      message: 'Verification codes sent to your email and mobile number.',
      phone: normalizedPhone.slice(-4).padStart(normalizedPhone.length, '*'),
      expiresAt
    };
    if (emailResult.testMode) response.emailOtp = emailOtp;
    if (smsResult.reason === 'test_mode_skip') response.smsOtp = smsOtp;
    if (emailResult.testMode || smsResult.reason === 'test_mode_skip') {
      response.devNote = 'Verification codes are shown only in non-production test mode.';
    }
    res.json(response);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/verify-registration', otpVerifyRateLimit, otpTargetVerifyRateLimit, async (req, res) => {
  try {
    const { phone, emailOtp, smsOtp } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(normalizedPhone) ||
        !/^\d{6}$/.test(String(emailOtp || '')) ||
        !/^\d{6}$/.test(String(smsOtp || ''))) {
      return res.status(400).json({ success: false, message: 'Phone and both 6-digit verification codes are required' });
    }

    const { data: otpData, error: otpError } = await supabase
      .from('registration_otps').select('*').eq('email', normalizedPhone).maybeSingle();

    if (otpError) throw otpError;
    if (!otpData) {
      return res.status(400).json({ success: false, message: 'No OTP found. Request new.' });
    }
    if (new Date() > new Date(otpData.expires_at)) {
      await supabase.from('registration_otps').delete().eq('email', normalizedPhone);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }
    const pendingData = otpData.data || {};
    if (!matchesOtp(otpData.otp, smsOtp) || !matchesOtp(pendingData.emailOtpHash, emailOtp)) {
      const attempts = Number(pendingData.attempts || 0) + 1;
      if (attempts >= 5) {
        await supabase.from('registration_otps').delete().eq('email', normalizedPhone);
        return res.status(429).json({ success: false, message: 'Too many incorrect codes. Restart registration.' });
      }
      const { error: attemptsError } = await supabase.from('registration_otps')
        .update({ data: { ...pendingData, attempts } }).eq('email', normalizedPhone);
      if (attemptsError) throw attemptsError;
      return res.status(400).json({ success: false, message: 'Invalid email or mobile verification code' });
    }

    const { name, email, phone: phoneFromData, passwordHash } = pendingData;
    if (!name || !email || !phoneFromData || !passwordHash) {
      return res.status(400).json({ success: false, message: 'Registration data missing' });
    }

    const { data: user, error: userError } = await supabase.from('users').insert({
      name,
      email,
      phone: normalizedPhone,
      password: passwordHash,
      role: 'user',
      is_verified: true
    }).select().single();

    if (userError) {
      console.error('User insert error:', userError);
      if (userError.code === '23505') {
        await supabase.from('registration_otps').delete().eq('email', normalizedPhone);
        return res.status(409).json({ success: false, message: 'Email or phone number already registered' });
      }
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }

    await supabase.from('registration_otps').delete().eq('email', normalizedPhone);

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      jwtSecret, { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true, message: 'Registration complete!',
      token, user: formatUser(user)
    });
  } catch (error) {
    console.error('Verify reg error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/resend-registration-otp', otpRequestRateLimit, otpTargetRequestRateLimit, async (req, res) => {
  try {
    const { phone } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) return res.status(400).json({ success: false, message: 'Valid phone required' });

    const { data: otpData, error } = await supabase
      .from('registration_otps').select('*').eq('email', normalizedPhone).maybeSingle();

    if (error) throw error;
    if (!otpData) {
      return res.status(400).json({ success: false, message: 'No registration. Start again.' });
    }
    const pendingData = otpData.data || {};
    if (!pendingData.email || !pendingData.passwordHash) {
      return res.status(400).json({ success: false, message: 'Registration must be restarted with an email address' });
    }
    if (!resend && !emailTestMode) {
      return res.status(503).json({ success: false, message: 'Email verification is temporarily unavailable' });
    }
    const lastSentAt = new Date(pendingData.lastSentAt || otpData.created_at).getTime();
    if (Date.now() - lastSentAt < 60_000) {
      return res.status(429).json({ success: false, message: 'Please wait before requesting another verification code' });
    }

    const smsOtp = String(crypto.randomInt(100000, 1000000));
    const emailOtp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const emailResult = await sendRegistrationEmail(pendingData.email, emailOtp, pendingData.name || 'Customer');
    if (!emailResult.sent) {
      console.error('Registration email resend failed:', emailResult.reason);
      return res.status(502).json({ success: false, message: 'Could not resend email verification code. Please try again later.' });
    }
    const smsResult = await sendFast2SMS(pendingData.phone || normalizedPhone, smsOtp, pendingData.name || 'Customer');
    if (!smsResult.sent && smsResult.reason !== 'test_mode_skip') {
      return res.status(502).json({ success: false, message: 'Could not resend mobile verification code. Please try again later.' });
    }

    const { error: updateError } = await supabase.from('registration_otps').update({
      otp: hashOtp(smsOtp),
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
      data: {
        ...pendingData,
        emailOtpHash: hashOtp(emailOtp),
        attempts: 0,
        lastSentAt: new Date().toISOString()
      }
    }).eq('email', normalizedPhone);
    if (updateError) throw updateError;

    const response = { success: true, message: 'Verification codes resent', expiresAt };
    if (emailResult.testMode) response.emailOtp = emailOtp;
    if (smsResult.reason === 'test_mode_skip') response.smsOtp = smsOtp;
    if (emailResult.testMode || smsResult.reason === 'test_mode_skip') {
      response.devNote = 'Verification codes are shown only in non-production test mode.';
    }
    res.json(response);
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/login', otpVerifyRateLimit, otpTargetVerifyRateLimit, async (req, res) => {
  try {
    const { password } = req.body;
    const loginIdentifier = req.body.username ?? req.body.email;
    if (typeof loginIdentifier !== 'string' || typeof password !== 'string' ||
        !loginIdentifier.trim() || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'Valid username/email/phone and password required' });
    }

    const identifier = loginIdentifier.trim();
    const normalizedEmail = identifier.toLowerCase();
    const normalizedPhone = identifier.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);
    const isEmail = identifier.includes('@');

    let admin = null;
    if (normalizedEmail === 'admin') {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('email', 'admin')
        .maybeSingle();
      if (error) throw error;
      admin = data;
    }

    if (admin) {
      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      const token = jwt.sign(
        { userId: admin.id, email: admin.email, role: admin.role || 'admin' },
        jwtSecret, { expiresIn: '7d' }
      );
      return res.json({
        success: true, token,
        mustChangePassword: await bcrypt.compare(initialAdminPassword, admin.password),
        user: { id: admin.id, email: 'admin', name: 'Admin', role: 'admin' }
      });
    }

    const userQuery = isEmail
      ? supabase.from('users').select('*').ilike('email', normalizedEmail).single()
      : supabase.from('users').select('*').ilike('phone', `%${normalizedPhone}%`).single();
    const { data: user } = await userQuery;

    if (!user || user.role === 'admin') return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.is_verified) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      jwtSecret, { expiresIn: '7d' }
    );
    res.json({ success: true, token, user: formatUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    const decoded = jwt.verify(token, jwtSecret);
    const { data: user } = await supabase.from('users')
      .select('id, name, email, phone, role, is_verified, created_at')
      .eq('id', decoded.userId).single();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: formatUser(user) });
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// FORGOT PASSWORD — SMS only
app.post('/api/auth/forgot-password', otpRequestRateLimit, otpTargetRequestRateLimit, async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid registered 10-digit mobile number' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name, phone, role')
      .eq('phone', phone)
      .eq('is_verified', true)
      .maybeSingle();
    if (userError) throw userError;

    if (!user || user.role === 'admin') {
      return res.json({ success: true, message: 'If an account exists, a verification code will be sent.' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { error: deleteError } = await supabase
      .from('password_resets')
      .delete()
      .ilike('email', user.email);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from('password_resets').insert({
      email: user.email,
      otp: hashOtp(otp),
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    });
    if (insertError) throw insertError;

    const smsResult = await sendFast2SMS(phone, otp, user.name || 'User');
    if (!smsResult.sent && smsResult.reason !== 'test_mode_skip') {
      const { error: cleanupError } = await supabase
        .from('password_resets')
        .delete()
        .ilike('email', user.email);
      if (cleanupError) throw cleanupError;
      console.error(`Password-reset SMS delivery failed: ${smsResult.reason}`);
      return res.status(502).json({ success: false, message: 'Could not send verification code. Please try again later.' });
    }

    const response = { success: true, message: 'If an account exists, a verification code will be sent.' };
    if (smsResult.reason === 'test_mode_skip' && smsTestMode) {
      response.otp = smsResult.otp;
      response.devNote = 'SMS skipped (test mode). OTP shown for testing.';
    }
    response.phone = phone.slice(-4).padStart(phone.length, '*');
    res.json(response);
  } catch (error) {
    console.error('Forgot error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/verify-otp', otpVerifyRateLimit, otpTargetVerifyRateLimit, async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const otp = String(req.body.otp || '').trim();
    if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Registered mobile number and 6-digit OTP required' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, phone, role')
      .eq('phone', phone)
      .eq('is_verified', true)
      .maybeSingle();
    if (userError) throw userError;
    if (!user || user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'No active verification code found. Request a new one.' });
    }

    const { data: resetData, error } = await supabase
      .from('password_resets')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();

    if (error) throw error;
    if (!resetData) return res.status(400).json({ success: false, message: 'No active verification code found. Request a new one.' });
    if (new Date() > new Date(resetData.expires_at)) {
      const { error: deleteError } = await supabase.from('password_resets').delete().ilike('email', user.email);
      if (deleteError) throw deleteError;
      return res.status(400).json({ success: false, message: 'Verification code expired. Request a new one.' });
    }
    if (!matchesOtp(resetData.otp, otp)) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    const resetToken = jwt.sign(
      { userId: user.id, phone, purpose: 'reset-password' },
      jwtSecret, { expiresIn: '10m' }
    );
    const { error: updateError } = await supabase
      .from('password_resets')
      .update({
        otp: hashOtp(resetToken),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      })
      .ilike('email', user.email);
    if (updateError) throw updateError;

    res.json({ success: true, message: 'Verification code accepted', resetToken });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/reset-password', otpVerifyRateLimit, otpTargetVerifyRateLimit, async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const { newPassword, resetToken } = req.body;

    if (!/^[6-9]\d{9}$/.test(phone) || !newPassword || !resetToken) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 ||
        Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ success: false, message: 'Password must be 8-72 characters long' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, jwtSecret);
      if (decoded.phone !== phone || !decoded.userId || decoded.purpose !== 'reset-password') {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
    } catch {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, phone, role')
      .eq('id', decoded.userId)
      .eq('phone', phone)
      .eq('is_verified', true)
      .maybeSingle();
    if (userError) throw userError;
    if (!user || user.role === 'admin') return res.status(401).json({ success: false, message: 'Invalid or expired reset session' });

    const { data: resetData, error: resetLookupError } = await supabase
      .from('password_resets')
      .select('otp, expires_at')
      .ilike('email', user.email)
      .maybeSingle();
    if (resetLookupError) throw resetLookupError;
    if (!resetData || new Date() > new Date(resetData.expires_at) ||
        !matchesOtp(resetData.otp, resetToken)) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset session. Request a new code.' });
    }

    const { data: consumedReset, error: consumeError } = await supabase
      .from('password_resets')
      .delete()
      .ilike('email', user.email)
      .eq('otp', hashOtp(resetToken))
      .gt('expires_at', new Date().toISOString())
      .select('email')
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumedReset) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset session. Request a new code.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .eq('phone', phone)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedUser) return res.status(401).json({ success: false, message: 'Invalid or expired reset session' });

    res.json({ success: true, message: 'Password reset!' });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =============================================
// PRODUCTS
// =============================================
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    let query = supabase.from('products').select('*');

    if (category && category !== 'All') query = query.eq('category', category);
    if (search) {
      query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%,description.ilike.%${search}%`);
    }
    if (sort === 'price-low') query = query.order('price', { ascending: true });
    else if (sort === 'price-high') query = query.order('price', { ascending: false });
    else if (sort === 'name') query = query.order('name', { ascending: true });
    else if (sort === 'discount') query = query.order('discount_percent', { ascending: false });
    else query = query.order('created_at', { ascending: false });

    const { data: products, error } = await query;
    if (error) return res.status(500).json({ success: false, message: 'Error fetching' });

    res.json({ success: true, products: products.map(formatProduct) });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (error || !product) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, product: formatProduct(product) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.post('/api/products/add', requireAdmin, async (req, res) => {
  try {
    const {
      name, originalPrice, discountPercent, category, stock, description, icon,
      imageUrl, images, brand, weight, color, size, material, warranty, tags,
      promoCode, promoDiscount, videoUrl, videoType, attributes
    } = req.body;

    if (!name || !originalPrice || !imageUrl) {
      return res.status(400).json({ success: false, message: 'Name, price, image required' });
    }

    const normalizedPromoCode = promoCode ? String(promoCode).trim().toUpperCase() : '';
    const normalizedPromoDiscount = parseFloat(promoDiscount) || 0;

    let finalPrice = parseFloat(originalPrice);
    const discount = parseFloat(discountPercent) || 0;
    if (discount > 0) finalPrice -= finalPrice * (discount / 100);

    let parsedImages = [];
    if (images) {
      try { parsedImages = typeof images === 'string' ? JSON.parse(images) : images; }
      catch { parsedImages = images.split(',').map(i => i.trim()); }
    }
    if (imageUrl && parsedImages.length === 0) parsedImages = [imageUrl.trim()];

    let parsedTags = [];
    if (tags) {
      try { parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags; }
      catch { parsedTags = tags.split(',').map(t => t.trim()); }
    }

    const productData = {
      name: name.trim(), original_price: parseFloat(originalPrice),
      price: Math.round(finalPrice), discount_percent: discount,
      category: category || 'Face Wash', stock: parseInt(stock) || 10,
      description: description || '', icon: icon || '📦',
      image: imageUrl.trim(), image_url: imageUrl.trim(), images: parsedImages,
      brand: brand || '', weight: weight || null, color: color || '',
      size: size || '', material: material || '', warranty: warranty || '',
      tags: parsedTags, promo_code: normalizedPromoCode,
      promo_discount: normalizedPromoDiscount, is_active: true,
      rating: 0, reviews_count: 0, popularity: 0,
      video_url: videoUrl || null, video_type: videoType || 'youtube',
      attributes: attributes || {}
    };

    const { data: product, error } = await supabase.from('products').insert(productData).select().single();
    if (error) return res.status(500).json({ success: false, message: 'Failed to add product' });

    res.status(201).json({ success: true, message: 'Product added', product: formatProduct(product) });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.put('/api/products/update/:id', requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const { data: current } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (!current) return res.status(404).json({ success: false, message: 'Not found' });

    const updateData = {};
    if (updates.name) updateData.name = updates.name.trim();
    if (updates.originalPrice) {
      updateData.original_price = parseFloat(updates.originalPrice);
      const disc = updates.discountPercent !== undefined ? parseFloat(updates.discountPercent) : current.discount_percent;
      updateData.price = Math.round(updateData.original_price - (updateData.original_price * (disc / 100)));
    }
    if (updates.discountPercent !== undefined) {
      updateData.discount_percent = parseFloat(updates.discountPercent);
      const orig = updateData.original_price || current.original_price;
      updateData.price = Math.round(orig - (orig * (updateData.discount_percent / 100)));
    }
    if (updates.category) updateData.category = updates.category.trim();
    if (updates.stock !== undefined) updateData.stock = parseInt(updates.stock);
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.icon) updateData.icon = updates.icon;
    if (updates.imageUrl !== undefined) {
      updateData.image = updates.imageUrl.trim();
      updateData.image_url = updates.imageUrl.trim();
    }
    if (updates.images !== undefined) {
      try { updateData.images = typeof updates.images === 'string' ? JSON.parse(updates.images) : updates.images; }
      catch { updateData.images = updates.images.split(',').map(i => i.trim()); }
    }
    if (updates.brand !== undefined) updateData.brand = updates.brand.trim();
    if (updates.tags !== undefined) {
      try { updateData.tags = typeof updates.tags === 'string' ? JSON.parse(updates.tags) : updates.tags; }
      catch { updateData.tags = updates.tags.split(',').map(t => t.trim()); }
    }
    if (updates.videoUrl !== undefined) updateData.video_url = updates.videoUrl || null;
    if (updates.videoType !== undefined) updateData.video_type = updates.videoType || 'youtube';
    if (updates.promoCode !== undefined) updateData.promo_code = String(updates.promoCode).trim().toUpperCase();
    if (updates.promoDiscount !== undefined) updateData.promo_discount = Math.min(100, Math.max(0, parseFloat(updates.promoDiscount) || 0));
    if (updates.attributes !== undefined) updateData.attributes = updates.attributes;

    const { data: product, error } = await supabase.from('products').update(updateData).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ success: false, message: 'Error updating' });

    res.json({ success: true, message: 'Updated', product: formatProduct(product) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.delete('/api/products/delete/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ success: false, message: 'Error deleting' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// =============================================
// PRODUCT REVIEWS
// =============================================
app.post('/api/products/:id/reviews', requireAuth, uploadVideo.single('video'), async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.userId;
    const { rating, reviewText, orderId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating 1-5 required' });
    }

    const { data: product } = await supabase.from('products').select('id').eq('id', productId).single();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { data: user } = await supabase.from('users').select('name, email').eq('id', userId).single();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let isVerified = false;
    if (orderId) {
      const { data: order } = await supabase.from('orders')
        .select('id, status, items, user_id').eq('id', orderId).single();

      if (order && order.user_id === userId && order.status === 'Delivered' &&
          (order.items || []).some(i => i.product_id === productId)) {
        isVerified = true;
      }
    }

    let videoUrl = null;
    let videoPath = null;
    if (req.file) {
      videoPath = `/uploads/reviews/${req.file.filename}`;
      videoUrl = videoPath;
    }

    const { data: review, error: reviewError } = await supabase.from('product_reviews').insert({
      product_id: productId, user_id: userId,
      user_name: user.name || 'User', user_email: user.email,
      order_id: orderId || null, rating: parseInt(rating),
      review_text: reviewText || '', video_url: videoUrl, video_path: videoPath,
      is_verified_purchase: isVerified, created_at: new Date().toISOString()
    }).select().single();

    if (reviewError) {
      console.error('Review insert error:', reviewError);
      return res.status(500).json({ success: false, message: 'Failed to save review' });
    }

    const { data: allReviews } = await supabase.from('product_reviews')
      .select('id, video_path, created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (allReviews && allReviews.length > 10) {
      const toDelete = allReviews.slice(10);
      for (const old of toDelete) {
        if (old.video_path) {
          const fullPath = path.join(__dirname, old.video_path.replace('/uploads/', 'uploads/'));
          if (fs.existsSync(fullPath)) {
            try { fs.unlinkSync(fullPath); } catch (e) { console.error('File delete error:', e); }
          }
        }
        await supabase.from('product_reviews').delete().eq('id', old.id);
      }
      console.log(`🧹 Auto-deleted ${toDelete.length} old reviews for product ${productId}`);
    }

    const { data: agg } = await supabase.from('product_reviews')
      .select('rating').eq('product_id', productId);

    if (agg && agg.length > 0) {
      const avgRating = agg.reduce((s, r) => s + r.rating, 0) / agg.length;
      await supabase.from('products').update({
        rating: Math.round(avgRating * 10) / 10,
        reviews_count: agg.length
      }).eq('id', productId);
    }

    res.status(201).json({ success: true, message: 'Review added', review });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    const { data: reviews, error } = await supabase.from('product_reviews')
      .select('*')
      .eq('product_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return res.status(500).json({ success: false, message: 'Error' });

    const formatted = (reviews || []).map(r => ({
      ...r,
      videoUrl: r.video_url ? `${req.protocol}://${req.get('host')}${r.video_url}` : null
    }));

    res.json({ success: true, reviews: formatted, total: formatted.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// =============================================
// BANK DETAILS (Refund ke liye — COD returns)
// =============================================
app.get('/api/bank-details', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bank_details')
      .select('*')
      .eq('user_id', req.userId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, message: 'Error fetching bank details' });
    res.json({ success: true, bankDetails: formatBankDetails(data) });
  } catch (error) {
    console.error('Get bank details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/bank-details', requireAuth, async (req, res) => {
  try {
    const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;

    if (!accountHolderName || !accountNumber || !ifscCode || !bankName) {
      return res.status(400).json({
        success: false,
        message: 'Account holder name, account number, IFSC, and bank name are required'
      });
    }

    if (!/^[A-Za-z\s.]{3,}$/.test(String(accountHolderName).trim())) {
      return res.status(400).json({ success: false, message: 'Invalid account holder name' });
    }
    if (!/^\d{9,18}$/.test(String(accountNumber).replace(/\s/g, ''))) {
      return res.status(400).json({ success: false, message: 'Account number must be 9-18 digits' });
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(ifscCode).trim().toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Invalid IFSC code (e.g., SBIN0001234)' });
    }
    if (upiId && !/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(String(upiId).trim())) {
      return res.status(400).json({ success: false, message: 'Invalid UPI ID' });
    }

    const payload = {
      user_id: req.userId,
      account_holder_name: String(accountHolderName).trim(),
      account_number: String(accountNumber).replace(/\s/g, ''),
      ifsc_code: String(ifscCode).trim().toUpperCase(),
      bank_name: String(bankName).trim(),
      upi_id: upiId ? String(upiId).trim() : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('bank_details')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Bank details upsert error:', error);
      return res.status(500).json({ success: false, message: 'Failed to save bank details' });
    }

    res.json({
      success: true,
      message: 'Bank details saved successfully',
      bankDetails: formatBankDetails(data)
    });
  } catch (error) {
    console.error('Save bank details error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =============================================
// CART
// =============================================
app.get('/api/cart', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    let { data: cart, error } = await supabase.from('carts').select('*').eq('user_id', decoded.userId).single();
    if (error && error.code === 'PGRST116') {
      const { data: newCart } = await supabase.from('carts').insert({
        user_id: decoded.userId, items: [], total_items: 0, total_price: 0, total_savings: 0
      }).select().single();
      cart = newCart;
    } else if (error) return res.status(500).json({ success: false, message: 'Error' });
    res.json({ success: true, cart: formatCart(cart) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.post('/api/cart/add', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const { data: cartUser, error: cartUserError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (cartUserError) throw cartUserError;
    if (!cartUser) {
      return res.status(403).json({
        success: false,
        message: 'Please sign in with a customer account to use the cart'
      });
    }

    const { productId, selectedAttributes = {}, promoCode: requestedPromoCode = '' } = req.body;
    const quantity = Number(req.body.qty ?? 1);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Valid product ID and quantity required' });
    }
    if (!selectedAttributes || typeof selectedAttributes !== 'object' || Array.isArray(selectedAttributes)) {
      return res.status(400).json({ success: false, message: 'Invalid product options' });
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.stock <= 0) return res.status(400).json({ success: false, message: 'Out of stock' });
    const promoCode = String(requestedPromoCode || '').trim().toUpperCase();
    if (promoCode && (promoCode !== String(product.promo_code || '').trim().toUpperCase() ||
      Number(product.promo_discount) <= 0)) {
      return res.status(400).json({ success: false, message: 'Promotion is no longer valid' });
    }
    const availableAttributes = product.attributes && typeof product.attributes === 'object'
      ? product.attributes : {};
    for (const [key, values] of Object.entries(availableAttributes)) {
      if (Array.isArray(values) && values.length > 0 &&
        (!values.includes(selectedAttributes[key]))) {
        return res.status(400).json({ success: false, message: `Select a valid ${key} option` });
      }
    }
    for (const [key, value] of Object.entries(selectedAttributes)) {
      if (!Array.isArray(availableAttributes[key]) || !availableAttributes[key].includes(value)) {
        return res.status(400).json({ success: false, message: 'Invalid product options' });
      }
    }
    const normalizedAttributes = normalizeCartAttributes(selectedAttributes);

    const { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (cartError) throw cartError;
    let items = cart?.items || [];

    const newItem = {
      product_id: product.id, name: product.name,
      price: promoCode
        ? Math.round(Number(product.price) * (1 - Number(product.promo_discount) / 100))
        : Number(product.price),
      original_price: product.original_price, discount_percent: product.discount_percent || 0,
      qty: quantity, image: product.image || '', image_url: product.image_url || '',
      stock: product.stock, category: product.category,
      selected_attributes: normalizedAttributes,
      promo_applied: Boolean(promoCode),
      promo_code: promoCode
    };
    const existingIdx = items.findIndex(item => getCartLineKey(item) === getCartLineKey(newItem));
    const totalProductQty = items
      .filter(item => String(item.product_id || item.productId || item._id) === String(product.id))
      .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    if (totalProductQty + quantity > Number(product.stock)) {
      return res.status(400).json({ success: false, message: 'Not enough stock' });
    }

    if (existingIdx > -1) {
      items[existingIdx] = { ...newItem, qty: (Number(items[existingIdx].qty) || 0) + quantity };
    } else {
      items.push(newItem);
    }

    const totalItems = items.reduce((s, i) => s + i.qty, 0);
    const totalPrice = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const totalSavings = items.reduce((s, i) => s + ((i.original_price - i.price) * i.qty), 0);

    const cartData = {
      user_id: userId, items, total_items: totalItems, total_price: totalPrice,
      total_savings: totalSavings, updated_at: new Date().toISOString()
    };
    const { data: updated, error: saveError } = cart
      ? await supabase.from('carts').update(cartData).eq('user_id', userId).select().single()
      : await supabase.from('carts').insert(cartData).select().single();
    if (saveError) throw saveError;

    res.json({ success: true, message: 'Added to cart', cart: formatCart(updated) });
  } catch (error) {
    console.error('Add to cart failed:', {
      code: error.code,
      message: error.message
    });
    const status = error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError'
      ? 401
      : error.code === '23503'
        ? 409
        : 500;
    res.status(status).json({
      success: false,
      message: status === 401
        ? 'Session expired. Please log in again.'
        : error.code === '23503'
          ? 'Cart user relationship is not configured correctly. Apply the latest Supabase migration.'
          : 'Could not add product to cart'
    });
  }
});

app.put('/api/cart/update/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    const { productId } = req.params;
    const { qty, selectedAttributes = {}, promoCode: requestedPromoCode = '' } = req.body;
    if (!Number.isSafeInteger(Number(qty)) || Number(qty) < 0) {
      return res.status(400).json({ success: false, message: 'Valid qty required' });
    }
    const quantity = Number(qty);
    if (!selectedAttributes || typeof selectedAttributes !== 'object' || Array.isArray(selectedAttributes)) {
      return res.status(400).json({ success: false, message: 'Invalid product options' });
    }
    const promoCode = String(requestedPromoCode || '').trim().toUpperCase();

    const { data: cart } = await supabase.from('carts').select('*').eq('user_id', decoded.userId).single();
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    let items = cart.items || [];
    const normalizedAttributes = normalizeCartAttributes(selectedAttributes);
    const idx = items.findIndex(item => getCartLineKey({
      ...item,
      selected_attributes: normalizeCartAttributes(item.selected_attributes || {})
    }) === getCartLineKey({
      product_id: productId,
      selected_attributes: normalizedAttributes,
      promo_code: promoCode
    }));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Item not found' });

    if (quantity === 0) items.splice(idx, 1);
    else {
      const { data: product, error: productError } = await supabase.from('products').select('stock').eq('id', productId).single();
      if (productError) throw productError;
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      const otherProductQty = items
        .filter((item, index) => index !== idx &&
          String(item.product_id || item.productId || item._id) === String(productId))
        .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      if (quantity > (Number(items[idx].qty) || 0) &&
        otherProductQty + quantity > Number(product.stock)) {
        return res.status(400).json({ success: false, message: 'Not enough stock' });
      }
      items[idx].qty = quantity;
    }

    const totalItems = items.reduce((s, i) => s + i.qty, 0);
    const totalPrice = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const totalSavings = items.reduce((s, i) => s + ((i.original_price - i.price) * i.qty), 0);

    const { data: updated, error: updateError } = await supabase.from('carts').update({
      items, total_items: totalItems, total_price: totalPrice,
      total_savings: totalSavings, updated_at: new Date().toISOString()
    }).eq('user_id', decoded.userId).select().single();
    if (updateError) throw updateError;

    res.json({ success: true, cart: formatCart(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.delete('/api/cart/remove/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    const { productId } = req.params;
    const { selectedAttributes = {}, promoCode: requestedPromoCode = '' } = req.body;
    if (!selectedAttributes || typeof selectedAttributes !== 'object' || Array.isArray(selectedAttributes)) {
      return res.status(400).json({ success: false, message: 'Invalid product options' });
    }
    const promoCode = String(requestedPromoCode || '').trim().toUpperCase();

    const { data: cart } = await supabase.from('carts').select('*').eq('user_id', decoded.userId).single();
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    let items = (cart.items || []).filter(item =>
      !(item.product_id === productId &&
        JSON.stringify(item.selected_attributes || {}) === JSON.stringify(selectedAttributes) &&
        String(item.promo_code || '').toUpperCase() === promoCode)
    );

    const totalItems = items.reduce((s, i) => s + i.qty, 0);
    const totalPrice = items.reduce((s, i) => s + (i.price * i.qty), 0);
    const totalSavings = items.reduce((s, i) => s + ((i.original_price - i.price) * i.qty), 0);

    const { data: updated } = await supabase.from('carts').update({
      items, total_items: totalItems, total_price: totalPrice,
      total_savings: totalSavings, updated_at: new Date().toISOString()
    }).eq('user_id', decoded.userId).select().single();

    res.json({ success: true, cart: formatCart(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.delete('/api/cart/clear', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    await supabase.from('carts').update({
      items: [], total_items: 0, total_price: 0, total_savings: 0,
      updated_at: new Date().toISOString()
    }).eq('user_id', decoded.userId);
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.post('/api/cart/sync', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Invalid items' });

    const processedItems = [];
    const requestedQuantities = new Map();
    for (const item of items) {
      const { data: product, error: productError } = await supabase.from('products').select('*').eq('id', item._id).single();
      if (productError && productError.code !== 'PGRST116') throw productError;
      if (!product) continue;
      const requestedQty = Number(item.qty);
      if (!Number.isSafeInteger(requestedQty) || requestedQty < 1) {
        return res.status(400).json({ success: false, message: 'Invalid cart quantity' });
      }
      const alreadyAdded = requestedQuantities.get(String(product.id)) || 0;
      const qty = Math.min(requestedQty, Math.max(0, Number(product.stock) - alreadyAdded));
      if (qty <= 0) continue;
      if (!item.selectedAttributes || typeof item.selectedAttributes !== 'object' || Array.isArray(item.selectedAttributes)) {
        return res.status(400).json({ success: false, message: 'Invalid product options' });
      }
      const selectedAttributes = normalizeCartAttributes(item.selectedAttributes);
      const availableAttributes = product.attributes && typeof product.attributes === 'object'
        ? product.attributes : {};
      for (const [key, values] of Object.entries(availableAttributes)) {
        if (Array.isArray(values) && values.length > 0 && !values.includes(selectedAttributes[key])) {
          return res.status(400).json({ success: false, message: `Select a valid ${key} option` });
        }
      }
      for (const [key, value] of Object.entries(selectedAttributes)) {
        if (!Array.isArray(availableAttributes[key]) || !availableAttributes[key].includes(value)) {
          return res.status(400).json({ success: false, message: 'Invalid product options' });
        }
      }
      const promoCode = String(item.promoCode || '').trim().toUpperCase();
      if (promoCode && (promoCode !== String(product.promo_code || '').trim().toUpperCase() ||
        Number(product.promo_discount) <= 0)) {
        return res.status(400).json({ success: false, message: 'Promotion is no longer valid' });
      }
      processedItems.push({
        product_id: product.id, name: product.name,
        price: promoCode
          ? Math.round(Number(product.price) * (1 - Number(product.promo_discount) / 100))
          : Number(product.price),
        original_price: product.original_price, discount_percent: product.discount_percent || 0,
        qty, image: product.image || '', image_url: product.image_url || '',
        stock: product.stock, category: product.category,
        selected_attributes: selectedAttributes,
        promo_applied: Boolean(promoCode),
        promo_code: promoCode
      });
      requestedQuantities.set(String(product.id), alreadyAdded + qty);
    }

    const totalItems = processedItems.reduce((s, i) => s + i.qty, 0);
    const totalPrice = processedItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const totalSavings = processedItems.reduce((s, i) => s + ((i.original_price - i.price) * i.qty), 0);

    const { data: cart } = await supabase.from('carts').upsert({
      user_id: decoded.userId, items: processedItems,
      total_items: totalItems, total_price: totalPrice,
      total_savings: totalSavings, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).select().single();

    res.json({ success: true, message: 'Cart synced', cart: formatCart(cart) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// =============================================
// ORDER OTP — SMS only
// =============================================
app.post('/api/orders/send-otp', requireAuth, otpRequestRateLimit, otpTargetRequestRateLimit, noStore, async (req, res) => {
  try {
    const userId = req.userId;
    const { data: user } = await supabase.from('users')
      .select('id, email, name, phone').eq('id', userId).single();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await supabase.from('order_otps').delete().eq('user_id', userId);
    const { error: insertError } = await supabase.from('order_otps').insert({
      user_id: userId, email: user.email, phone: user.phone,
      otp: hashOtp(otp), expires_at: expiresAt.toISOString(), created_at: new Date().toISOString()
    });

    if (insertError) return res.status(500).json({ success: false, message: 'Failed to generate' });

    setImmediate(async () => {
      if (user.phone) {
        const smsResult = await sendFast2SMS(user.phone, otp, user.name);
        if (!smsResult.sent) {
          console.error(`Order SMS delivery failed: ${smsResult.reason}`);
        }
      }
    });

    const response = {
      success: true, message: 'OTP sent to your mobile',
      phone: user.phone, expiresAt
    };
    if (smsTestMode && user.phone) {
      const nPhone = String(user.phone).replace(/\D/g, '').slice(-10);
      if (!smsTestNumbers.includes(nPhone)) {
        response.otp = otp;
        response.devNote = 'SMS skipped (test mode). OTP shown for testing.';
      }
    }
    res.json(response);
  } catch (error) {
    console.error('Order OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/orders/verify-otp', requireAuth, otpVerifyRateLimit, otpTargetVerifyRateLimit, noStore, async (req, res) => {
  try {
    const userId = req.userId;
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: 'OTP required' });

    const { data: otpData, error } = await supabase
      .from('order_otps').select('*').eq('user_id', userId).single();

    if (error || !otpData) return res.status(400).json({ success: false, message: 'No OTP. Request new.' });
    if (new Date() > new Date(otpData.expires_at)) {
      await supabase.from('order_otps').delete().eq('user_id', userId);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }
    if (!matchesOtp(otpData.otp, String(otp).trim())) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    await supabase.from('order_otps').delete().eq('user_id', userId);

    const orderConfirmToken = jwt.sign(
      { userId, purpose: 'order-confirmation' },
      jwtSecret, { expiresIn: '10m' }
    );

    res.json({ success: true, message: 'OTP verified', orderConfirmToken });
  } catch (error) {
    console.error('Order verify error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =============================================
// PAYU PAYMENT ROUTES
// =============================================

/**
 * POST /api/payment/payu/initiate
 * Auth: User (requireAuth)
 * Body: { orderId }
 * Returns: { success, paymentUrl, params }
 */
app.post('/api/payment/payu/initiate', requireAuth, noStore, async (req, res) => {
  try {
    if (!payuKey || !payuSalt) {
      return res.status(500).json({ success: false, message: 'PayU not configured on server' });
    }

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Order verify — user ka hai ya nahi
    const { data: order, error: orderErr } = await supabase
      .from('orders').select('*').eq('id', orderId).single();

    if (orderErr || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.user_id !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }
    if (order.payment_method !== 'online') {
      return res.status(400).json({ success: false, message: 'Order is not online payment' });
    }
    if (!['Payment Verification Pending', 'Payment Failed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'This order cannot start a payment' });
    }

    const txnid = `TXN${Date.now()}${crypto.randomBytes(8).toString('hex')}`;
    const amountStr = Number(order.total).toFixed(2);
    const delivery = order.delivery || {};
    const productinfo = (order.items || []).map(item => item.name).join(', ').slice(0, 100) || 'AteliMarket Order';
    const firstname = String(delivery.fullName || order.user_name || 'Customer').slice(0, 60);
    const emailStr = String(order.user_email || delivery.email || '').trim().slice(0, 60);
    const phoneStr = String(delivery.phone || '').replace(/\D/g, '').slice(-10);
    if (!Number.isFinite(Number(order.total)) || Number(order.total) <= 0 ||
      !emailStr || !/^\d{10}$/.test(phoneStr)) {
      return res.status(400).json({ success: false, message: 'Order contact or total is invalid' });
    }

    // PayU hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt)
    const hashString = `${payuKey}|${txnid}|${amountStr}|${productinfo}|${firstname}|${emailStr}|||||||||||${payuSalt}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    const history = Array.isArray(order.status_history) ? [...order.status_history] : [];
    history.push({
      status: 'PayU Initiated',
      timestamp: new Date().toISOString(),
      updatedBy: 'System',
      details: `PayU txnid: ${txnid}`
    });
    const { error: updateError } = await supabase.from('orders').update({
      reference_id: txnid,
      status: 'Payment Verification Pending',
      status_history: history,
      updated_at: new Date().toISOString()
    }).eq('id', orderId);
    if (updateError) throw updateError;

    res.json({
      success: true,
      paymentUrl: payuBaseUrl,
      txnid,
      params: {
        key: payuKey,
        txnid,
        amount: amountStr,
        productinfo,
        firstname,
        email: emailStr,
        phone: phoneStr,
        surl: payuSuccessUrl,
        furl: payuFailureUrl,
        hash,
        service_provider: 'payu_paisa'
      }
    });
  } catch (err) {
    console.error('PayU initiate error:', err);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
});

/**
 * POST /api/payment/payu/callback
 * PayU form POST karta hai (surl/furl)
 * Reverse hash verify → order status update
 */
app.post('/api/payment/payu/callback', async (req, res) => {
  try {
    const {
      status, txnid, mihpayid, amount, productinfo,
      firstname, email, hash, key: callbackKey, additionalCharges,
      udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '',
    } = req.body;

    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(txnid || '')) || !hash) {
      return res.redirect(`${frontendUrl}/orders?payment=failure&reason=missing_fields`);
    }

    const { data: order, error: orderLookupError } = await supabase.from('orders')
      .select('*').eq('reference_id', String(txnid)).maybeSingle();
    if (orderLookupError) throw orderLookupError;
    if (!order || order.payment_method !== 'online') {
      return res.redirect(`${frontendUrl}/orders?payment=failure&reason=txn_not_found`);
    }

    // 🔐 Reverse hash verify
    // Formula: sha512(salt|status|udf10|...|udf1|email|firstname|productinfo|amount|txnid|key)
    let reverseHashString;
    if (additionalCharges) {
      reverseHashString = `${additionalCharges}|${payuSalt}|${status}||||||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${payuKey}`;
    } else {
      reverseHashString = `${payuSalt}|${status}||||||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${payuKey}`;
    }

    const calculatedHash = crypto.createHash('sha512').update(reverseHashString).digest('hex');

    if (callbackKey !== payuKey || !matchesHash(calculatedHash, hash) ||
        !Number.isFinite(Number(amount)) || Number(amount).toFixed(2) !== Number(order.total).toFixed(2)) {
      console.error('PayU callback validation failed');
      return res.redirect(`${frontendUrl}/orders?payment=failure&reason=hash_mismatch`);
    }

    if (order.status === 'Payment Verified' || ['Confirmed', 'Shipped', 'Delivered'].includes(order.status)) {
      return res.redirect(`${frontendUrl}/orders?payment=success&txnid=${encodeURIComponent(txnid)}`);
    }
    if (order.status === 'Payment Failed') {
      return res.redirect(`${frontendUrl}/orders?payment=failure&txnid=${encodeURIComponent(txnid)}`);
    }
    if (order.status !== 'Payment Verification Pending') {
      return res.redirect(`${frontendUrl}/orders?payment=failure&reason=invalid_order_state`);
    }

    const history = Array.isArray(order?.status_history) ? [...order.status_history] : [];

    if (status === 'success') {
      history.push({
        status: 'Payment Verified',
        timestamp: new Date().toISOString(),
        updatedBy: 'PayU',
        details: `PayU ID: ${String(mihpayid || 'N/A').slice(0, 100)}`
      });
      const { data: updatedOrder, error: updateError } = await supabase.from('orders').update({
        status: 'Payment Verified',
        reference_id: txnid,
        status_history: history,
        updated_at: new Date().toISOString()
      }).eq('id', order.id).eq('reference_id', txnid)
        .eq('status', 'Payment Verification Pending').select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!updatedOrder) {
        const { data: latestOrder } = await supabase.from('orders')
          .select('status').eq('id', order.id).maybeSingle();
        const alreadyPaid = latestOrder &&
          ['Payment Verified', 'Confirmed', 'Shipped', 'Delivered'].includes(latestOrder.status);
        return res.redirect(`${frontendUrl}/orders?payment=${alreadyPaid ? 'success' : 'failure'}&txnid=${encodeURIComponent(txnid)}`);
      }

      void sendMetaPurchaseEvent(order);

      try {
        for (const item of (order?.items || [])) {
          if (item.product_id) {
            const { data: prod } = await supabase.from('products')
              .select('stock').eq('id', item.product_id).single();
            if (prod) {
              await supabase.from('products').update({
                stock: Math.max(0, (prod.stock || 0) - (item.qty || 1))
              }).eq('id', item.product_id);
            }
          }
        }
      } catch (stockErr) {
        console.error('Payment verified but stock update failed:', stockErr.message);
      }
    } else {
      if (status !== 'failure') {
        return res.redirect(`${frontendUrl}/orders?payment=failure&reason=invalid_status`);
      }
      history.push({
        status: 'Payment Failed',
        timestamp: new Date().toISOString(),
        updatedBy: 'PayU',
        details: 'Payment failed at gateway'
      });
      const { data: updatedOrder, error: updateError } = await supabase.from('orders').update({
        status: 'Payment Failed',
        status_history: history,
        updated_at: new Date().toISOString()
      }).eq('id', order.id).eq('reference_id', txnid)
        .eq('status', 'Payment Verification Pending').select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!updatedOrder) {
        const { data: latestOrder } = await supabase.from('orders')
          .select('status').eq('id', order.id).maybeSingle();
        const alreadyPaid = latestOrder &&
          ['Payment Verified', 'Confirmed', 'Shipped', 'Delivered'].includes(latestOrder.status);
        return res.redirect(`${frontendUrl}/orders?payment=${alreadyPaid ? 'success' : 'failure'}&txnid=${encodeURIComponent(txnid)}`);
      }
    }

    if (status === 'success') {
      return res.redirect(`${frontendUrl}/orders?payment=success&txnid=${encodeURIComponent(txnid)}`);
    }
    return res.redirect(`${frontendUrl}/orders?payment=failure&txnid=${encodeURIComponent(txnid)}`);

  } catch (err) {
    console.error('PayU callback processing failed:', err.message);
    res.redirect(`${frontendUrl}/orders?payment=failure&reason=server_error`);
  }
});

// =============================================
// ORDER ROUTES
// =============================================
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    console.log('📦 Creating order...');

    const {
      items, total, paymentMethod, delivery, orderConfirmToken,
      attribution, marketingConsent
    } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'Login required' });
    const decodedUser = jwt.verify(authHeader.split(' ')[1], jwtSecret);
    const userId = decodedUser.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Invalid session' });
    if (!['cod', 'online'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid payment method' });
    }

    if (paymentMethod === 'cod') {
      if (!orderConfirmToken) {
        return res.status(400).json({
          success: false,
          message: 'Order confirmation OTP verification required. Please verify OTP first.'
        });
      }
      try {
        const decodedToken = jwt.verify(orderConfirmToken, jwtSecret);
        if (decodedToken.purpose !== 'order-confirmation' || decodedToken.userId !== userId) {
          return res.status(401).json({ success: false, message: 'Invalid confirmation token' });
        }
      } catch {
        return res.status(401).json({ success: false, message: 'Confirmation token expired' });
      }
    }
    if (paymentMethod === 'cod') {
      const primaryPhone = String(delivery?.phone || '').replace(/\D/g, '');
      const alternatePhone = String(delivery?.alternatePhone || '').replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(alternatePhone)) {
        return res.status(400).json({ success: false, message: 'Alternate phone required for COD' });
      }
      if (!/^[6-9]\d{9}$/.test(primaryPhone)) {
        return res.status(400).json({ success: false, message: 'Primary phone required' });
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart empty' });
    }
    if (!Number.isFinite(Number(total)) || Number(total) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid total' });
    }
    if (!delivery || typeof delivery !== 'object') {
      return res.status(400).json({ success: false, message: 'Delivery required' });
    }

    const requiredFields = ['fullName', 'phone', 'address', 'city', 'state', 'pincode'];
    const missingFields = requiredFields.filter(f => !String(delivery[f] || '').trim());
    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, message: `Missing: ${missingFields.join(', ')}` });
    }

    const { data: user, error: userError } = await supabase.from('users')
      .select('id, name, email, phone').eq('id', userId).maybeSingle();
    if (userError) throw userError;
    if (!user) return res.status(401).json({ success: false, message: 'Account not found' });

    const regPhone = String(user.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const delPhone = String(delivery.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!regPhone || delPhone !== regPhone) {
      return res.status(400).json({ success: false, message: 'Phone must match registered' });
    }

    const orderItems = [];
    const requestedQuantities = new Map();
    for (const item of items) {
      const productId = String(item?._id || item?.productId || '');
      const qty = Number(item?.qty);
      if (!productId || !Number.isSafeInteger(qty) || qty < 1) {
        return res.status(400).json({ success: false, message: 'Invalid product or quantity' });
      }

      const { data: product, error: productError } = await supabase.from('products')
        .select('id, name, price, original_price, discount_percent, stock, image, image_url, category, promo_code, promo_discount, attributes')
        .eq('id', productId).maybeSingle();
      if (productError) throw productError;
      if (!product || product.stock <= 0) {
        return res.status(400).json({ success: false, message: 'A product in your cart is no longer available' });
      }

      const totalRequested = (requestedQuantities.get(productId) || 0) + qty;
      if (totalRequested > Number(product.stock)) {
        return res.status(400).json({ success: false, message: `${product.name} does not have enough stock` });
      }
      requestedQuantities.set(productId, totalRequested);

      const selectedAttributes = item.selectedAttributes && typeof item.selectedAttributes === 'object' &&
        !Array.isArray(item.selectedAttributes) ? item.selectedAttributes : {};
      const availableAttributes = product.attributes && typeof product.attributes === 'object'
        ? product.attributes : {};
      for (const [key, value] of Object.entries(selectedAttributes)) {
        if (!Array.isArray(availableAttributes[key]) || !availableAttributes[key].includes(value)) {
          return res.status(400).json({ success: false, message: `Invalid option selected for ${product.name}` });
        }
      }

      const promoCode = item.promoApplied ? String(item.promoCode || '').trim().toUpperCase() : '';
      let price = Number(product.price);
      if (promoCode) {
        if (promoCode !== String(product.promo_code || '').trim().toUpperCase() ||
            Number(product.promo_discount) <= 0) {
          return res.status(400).json({ success: false, message: `The promotion for ${product.name} is no longer valid` });
        }
        price = Math.round(price * (1 - Number(product.promo_discount) / 100));
      }

      orderItems.push({
        product_id: product.id,
        name: product.name,
        price,
        qty,
        image: product.image || product.image_url || '',
        originalPrice: Number(product.original_price) || price,
        discountPercent: Number(product.discount_percent) || 0,
        category: product.category || '',
        selectedAttributes
      });
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const calculatedTotal = subtotal + calculateDeliveryCharge(subtotal);
    if (Math.abs(Number(total) - calculatedTotal) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Cart prices have changed. Refresh your cart and try again.',
        expectedTotal: calculatedTotal
      });
    }

    const initialStatus = paymentMethod === 'online' ? 'Payment Verification Pending' : 'Pending';

    const orderData = {
      user_id: userId, user_name: user.name || 'User', user_email: user.email || '',
      items: orderItems, total: calculatedTotal,
      payment_method: paymentMethod || 'cod',
      attribution: sanitizeOrderAttribution(attribution),
      marketing_consent: marketingConsent === true,
      reference_id: null,
      delivery: {
        fullName: String(delivery.fullName || '').trim(),
        phone: String(delivery.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
        alternatePhone: String(delivery.alternatePhone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
        email: String(delivery.email || '').trim(),
        address: String(delivery.address || '').trim(),
        landmark: String(delivery.landmark || '').trim(),
        city: String(delivery.city || '').trim(),
        state: String(delivery.state || '').trim(),
        pincode: String(delivery.pincode || '').trim(),
        note: String(delivery.note || '').trim()
      },
      status: initialStatus,
      status_history: [{
        status: initialStatus, timestamp: new Date().toISOString(), updatedBy: 'System'
      }]
    };

    const { data: order, error: orderError } = await supabase.from('orders').insert(orderData).select().single();
    if (orderError) {
      console.error('Order insert error:', orderError);
      return res.status(500).json({ success: false, message: 'Failed to place order' });
    }

    if (userId) {
      await supabase.from('carts').update({
        items: [], total_items: 0, total_price: 0, total_savings: 0,
        updated_at: new Date().toISOString()
      }).eq('user_id', userId);
    }

    console.log(`✅ Order placed: ${order.id}`);
    if (paymentMethod === 'cod') void sendMetaPurchaseEvent(order);
    res.status(201).json({ success: true, message: 'Order placed', order: formatOrder(order) });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ success: false, message: 'Failed to place order' });
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { data: admin } = await supabase.from('admins').select('id').eq('id', userId).single();
    let query = supabase.from('orders').select('*');
    if (admin) query = query.order('created_at', { ascending: false });
    else query = query.eq('user_id', userId).order('created_at', { ascending: false });

    const { data: orders, error } = await query;
    if (error) return res.status(500).json({ success: false, message: 'Error' });

    res.json({ success: true, orders: orders.map(formatOrder) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.get('/api/orders/:id/invoice', requireAuth, async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let authorized = order.user_id === req.userId;
    if (!authorized) {
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('id')
        .eq('id', req.userId)
        .maybeSingle();
      if (adminError) throw adminError;
      authorized = Boolean(admin);
    }
    if (!authorized) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', req.userId)
        .maybeSingle();
      if (userError) throw userError;
      authorized = user?.role === 'admin';
    }
    if (!authorized) return res.status(403).json({ success: false, message: 'Unauthorized' });

    const delivered = order.status === 'Delivered' ||
      (Array.isArray(order.status_history) && order.status_history.some(event => event?.status === 'Delivered'));
    if (!delivered) {
      return res.status(409).json({ success: false, message: 'Invoice is available after delivery' });
    }

    const invoice = await generateInvoicePdf(order);
    const fileId = String(order.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(-36);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="VELQRA-invoice-${fileId}.pdf"`,
      'Cache-Control': 'private, no-store'
    });
    res.send(invoice);
  } catch (error) {
    console.error('Invoice generation error:', error.code || error.message);
    res.status(500).json({ success: false, message: 'Could not generate invoice' });
  }
});

app.get('/api/orders/:id/tracking', requireAuth, async (req, res) => {
  try {
    const { data: order, error } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (error || !order) return res.status(404).json({ success: false, message: 'Not found' });

    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, jwtSecret);
        const userId = decoded.userId;

        const { data: user } = await supabase.from('users').select('role').eq('id', userId).single();
        const { data: admin } = await supabase.from('admins').select('id').eq('id', userId).single();

        const isAdmin = (user && user.role === 'admin') || admin;
        const isOwner = order.user_id === userId;

        if (isAdmin || isOwner) {
          const timeline = getOrderTimeline(order);
          return res.json({
            success: true,
            tracking: {
              orderId: order.id, currentStatus: order.status, createdAt: order.created_at,
              items: order.items, total: order.total, delivery: order.delivery,
              timeline, statusHistory: order.status_history || []
            }
          });
        }
      } catch {}
    }
    res.status(403).json({ success: false, message: 'Unauthorized' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

function getOrderTimeline(order) {
  const timeline = [{
    status: 'Order Placed', description: 'Order placed successfully',
    timestamp: order.created_at, completed: true, icon: '🛒'
  }];

  if (order.payment_method === 'online') {
    const verified = ['Payment Verified', 'Confirmed', 'Shipped', 'Delivered', 'Return Requested'].includes(order.status);
    const pending = order.status === 'Payment Verification Pending';
    const failed = order.status === 'Payment Failed';                          // 👈 NEW
    timeline.push({
      status: 'Payment Verification',
      description: failed ? 'Payment failed at gateway' : pending ? 'Payment verification pending' : verified ? 'Payment verified' : 'In progress',  // 👈 UPDATED
      timestamp: verified ? new Date().toISOString() : null,
      completed: verified, icon: failed ? '❌' : '💳'                          // 👈 UPDATED
    });
  }

  // 👇 NEW — Payment Failed pe timeline yahin rok do
  if (order.status === 'Payment Failed') {
    timeline.push({
      status: 'Payment Failed', description: 'Payment was not completed. You can retry.',
      timestamp: new Date().toISOString(), completed: true, icon: '❌'
    });
    return timeline;
  }

  const statusMap = {
    'Confirmed': { icon: '✅', description: 'Order confirmed' },
    'Shipped': { icon: '🚚', description: 'Order shipped' },
    'Delivered': { icon: '📦', description: 'Order delivered' }
  };

  const statuses = ['Confirmed', 'Shipped', 'Delivered'];
  let isCompleted = true;
  const createdDate = new Date(order.created_at);

  for (const status of statuses) {
    const isDone = order.status === status ||
      (status === 'Confirmed' && ['Shipped', 'Delivered'].includes(order.status)) ||
      (status === 'Shipped' && ['Delivered'].includes(order.status));
    if (!isDone && isCompleted) isCompleted = false;

    let timestamp = null;
    if (order.status_history) {
      const h = order.status_history.find(x => x.status === status);
      if (h) timestamp = h.timestamp;
    }
    if (isDone && !timestamp) {
      const base = new Date(createdDate.getTime());
      if (status === 'Confirmed') base.setHours(base.getHours() + 1);
      else if (status === 'Shipped') base.setHours(base.getHours() + 24);
      else if (status === 'Delivered') base.setHours(base.getHours() + 48);
      timestamp = base.toISOString();
    }
    timeline.push({
      status, description: statusMap[status].description, timestamp,
      completed: isDone && isCompleted, icon: statusMap[status].icon
    });
  }

    if (order.status === 'Cancelled') {
    const h = order.status_history?.find(x => x.status === 'Cancelled');
    timeline.push({
      status: 'Cancelled', description: 'Order cancelled',
      timestamp: h?.timestamp || new Date().toISOString(), completed: true, icon: '❌'
    });
  }

  // 👇 NEW — Return flow timeline
  if (order.status === 'Return Requested' ||
      String(order.status || '').startsWith('Return ')) {
    const returnStages = [
      { key: 'Return Requested', label: 'Return Requested', icon: '↩️', desc: 'Return request submitted by customer' },
      { key: 'Return Approved', label: 'Return Approved', icon: '✅', desc: 'Return approved by admin' },
      { key: 'Return Pickup Scheduled', label: 'Pickup Scheduled', icon: '🚚', desc: 'Product pickup scheduled' },
      { key: 'Return Refund Initiated', label: 'Refund Initiated', icon: '💸', desc: 'Refund initiated to bank account' },
      { key: 'Return Refunded', label: 'Refunded', icon: '🎉', desc: 'Refund completed' }
    ];

    // Kahan tak pahuncha
    const historyStatuses = (order.status_history || []).map(h => h.status);
    const currentIdx = returnStages.findIndex(s => s.key === order.status);

    returnStages.forEach((stage, idx) => {
      const reached = historyStatuses.includes(stage.key) ||
                      (currentIdx !== -1 && idx <= currentIdx);
      let ts = null;
      const h = (order.status_history || []).find(x => x.status === stage.key);
      if (h) ts = h.timestamp;
      timeline.push({
        status: stage.label,
        description: stage.desc,
        timestamp: reached ? (ts || new Date().toISOString()) : null,
        completed: reached,
        icon: stage.icon
      });
    });

    // Rejected / Cancelled special
    if (order.status === 'Return Rejected' || order.status === 'Return Cancelled') {
      const h = (order.status_history || []).find(x => x.status === order.status);
      timeline.push({
        status: order.status === 'Return Rejected' ? 'Return Rejected' : 'Return Cancelled',
        description: order.status === 'Return Rejected'
          ? 'Return rejected by admin'
          : 'Return cancelled',
        timestamp: h?.timestamp || new Date().toISOString(),
        completed: true,
        icon: '❌'
      });
    }
    return timeline;
  }

  return timeline;
}

app.patch('/api/orders/:id/verify-payment', requireAdmin, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Auth required' });
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { data: admin } = await supabase.from('admins').select('id').eq('id', userId).single();
    const { data: user } = await supabase.from('users').select('role').eq('id', userId).single();
    const isAdmin = admin || (user && user.role === 'admin');
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.status !== 'Payment Verification Pending') {
      return res.status(400).json({ success: false, message: `Cannot verify. Status: ${order.status}` });
    }

    const history = order.status_history || [];
    history.push({ status: 'Payment Verified', timestamp: new Date().toISOString(), updatedBy: 'Admin' });

    const { data: updated } = await supabase.from('orders').update({
      status: 'Payment Verified', status_history: history, updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();

    if (order.payment_method === 'online') void sendMetaPurchaseEvent(updated);
    res.json({ success: true, message: 'Payment verified', order: formatOrder(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Auth required' });
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { data: user } = await supabase.from('users').select('role, name').eq('id', userId).single();
    const { data: admin } = await supabase.from('admins').select('id').eq('id', userId).single();
    const isAdmin = (user && user.role === 'admin') || admin;
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const validStatuses = ['Pending', 'Payment Verification Pending', 'Payment Verified', 'Payment Failed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const { data: order } = await supabase.from('orders')
      .select('status_history, status, payment_method').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    const history = order.status_history || [];
    history.push({ status, timestamp: new Date().toISOString(), updatedBy: user?.name || 'Admin' });

    const { data: updated } = await supabase.from('orders').update({
      status, status_history: history, updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();

    if (order.payment_method === 'online' &&
        order.status === 'Payment Verification Pending' &&
        ['Payment Verified', 'Confirmed', 'Shipped', 'Delivered'].includes(status)) {
      void sendMetaPurchaseEvent(updated);
    }

    res.json({
      success: true, message: 'Status updated',
      order: formatOrder(updated), tracking: { timeline: getOrderTimeline(updated) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.patch('/api/orders/:id/cancel', requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Auth required' });
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    const { data: admin } = await supabase.from('admins').select('id').eq('id', userId).single();
    const isAdmin = !!admin;
    const isOwner = order.user_id === userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, message: 'Unauthorized' });

    const cancellable = ['Pending', 'Payment Verification Pending', 'Payment Failed', 'Confirmed'];
    if (!cancellable.includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel. Status: ${order.status}` });
    }

    const history = order.status_history || [];
    history.push({ status: 'Cancelled', timestamp: new Date().toISOString(), updatedBy: isAdmin ? 'Admin' : 'User' });

    const { data: updated } = await supabase.from('orders').update({
      status: 'Cancelled', status_history: history, updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();

    res.json({ success: true, message: 'Cancelled', order: formatOrder(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Auth required' });
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { data: user } = await supabase.from('users').select('role').eq('id', userId).single();
    const { data: admin } = await supabase.from('admins').select('id').eq('id', userId).single();
    const isAdmin = (user && user.role === 'admin') || admin;
    if (!isAdmin) return res.status(403).json({ success: false, message: 'Admin only' });

    const { status, search, page = 1, limit = 10 } = req.query;
    let query = supabase.from('orders').select('*', { count: 'exact' });
    if (status && status !== 'all') query = query.eq('status', status);
    if (search) {
      query = query.or(`user_name.ilike.%${search}%,user_email.ilike.%${search}%,delivery->>phone.ilike.%${search}%`);
    }

    const skip = (page - 1) * limit;
    const { data: orders, error, count } = await query
      .order('created_at', { ascending: false })
      .range(skip, skip + parseInt(limit) - 1);
    if (error) return res.status(500).json({ success: false, message: 'Error' });

    const { data: statusCounts } = await supabase.from('orders').select('status');
    const counts = {
  all: 0, Pending: 0, 'Payment Verification Pending': 0,
  'Payment Verified': 0, 'Payment Failed': 0, Confirmed: 0, Shipped: 0, Delivered: 0, Cancelled: 0
};
    if (statusCounts) {
      counts.all = statusCounts.length;
      statusCounts.forEach(i => { if (counts.hasOwnProperty(i.status)) counts[i.status]++; });
    }

    res.json({
      success: true, orders: orders.map(order => formatOrder(order, true)),
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: count || orders.length, pages: Math.ceil((count || orders.length) / limit)
      },
      counts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

// =============================================
// RETURN REQUESTS — COD only, OTP + Bank details
// =============================================
app.post('/api/returns/send-otp', requireAuth, otpRequestRateLimit, otpTargetRequestRateLimit, noStore, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'Order ID required' });

    const { data: user } = await supabase
      .from('users')
      .select('id, name, phone, email')
      .eq('id', req.userId)
      .single();

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.phone) return res.status(400).json({ success: false, message: 'No phone on account' });

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.user_id !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }
    if (order.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }
    if ((order.payment_method || 'cod') !== 'cod') {
      return res.status(400).json({ success: false, message: 'Return flow is for COD orders only' });
    }

    const { data: existing } = await supabase
      .from('return_requests')
      .select('id, status')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Return already ${existing.status.toLowerCase()} for this order`
      });
    }

    const history = Array.isArray(order.status_history) ? order.status_history : [];
    const delivered = [...history].reverse().find(e => e.status === 'Delivered');
    const deliveredAt = new Date(delivered?.timestamp || order.updated_at || order.created_at);
    if (Date.now() - deliveredAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ success: false, message: '7-day return window has expired' });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await supabase.from('return_otps').delete().eq('user_id', req.userId);
    const { error: insertError } = await supabase.from('return_otps').insert({
      user_id: req.userId,
      order_id: orderId,
      otp: hashOtp(otp),
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString()
    });

    if (insertError) {
      console.error('Return OTP insert error:', insertError);
      return res.status(500).json({ success: false, message: 'Failed to generate OTP' });
    }

    setImmediate(async () => {
      const smsResult = await sendFast2SMS(user.phone, otp, user.name);
      if (!smsResult.sent) {
        console.error(`Return SMS delivery failed: ${smsResult.reason}`);
      }
    });

    const response = {
      success: true,
      message: 'OTP sent to your registered mobile',
      phone: user.phone,
      expiresAt
    };
    if (smsTestMode) {
      const nPhone = String(user.phone).replace(/\D/g, '').slice(-10);
      if (!smsTestNumbers.includes(nPhone)) {
        response.otp = otp;
        response.devNote = 'SMS skipped (test mode). OTP shown for testing.';
      }
    }
    res.json(response);
  } catch (error) {
    console.error('Return send-otp error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/returns/verify-otp', requireAuth, otpVerifyRateLimit, otpTargetVerifyRateLimit, noStore, async (req, res) => {
  try {
    const { otp, orderId } = req.body;
    if (!otp || !orderId) {
      return res.status(400).json({ success: false, message: 'OTP and orderId required' });
    }

    const { data: otpData, error } = await supabase
      .from('return_otps')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    if (error || !otpData) {
      return res.status(400).json({ success: false, message: 'No OTP found. Request a new one.' });
    }
    if (otpData.order_id !== orderId) {
      return res.status(400).json({ success: false, message: 'OTP was generated for a different order' });
    }
    if (new Date() > new Date(otpData.expires_at)) {
      await supabase.from('return_otps').delete().eq('user_id', req.userId);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }
    if (!matchesOtp(otpData.otp, String(otp).trim())) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    await supabase.from('return_otps').delete().eq('user_id', req.userId);

    const returnToken = jwt.sign(
      { userId: req.userId, orderId, purpose: 'return-request' },
      jwtSecret,
      { expiresIn: '15m' }
    );

    res.json({ success: true, message: 'OTP verified', returnToken });
  } catch (error) {
    console.error('Return verify-otp error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/returns', requireAuth, async (req, res) => {
  try {
    const { orderId, items, reason, description, returnToken } = req.body;

    if (!orderId || !returnToken) {
      return res.status(400).json({ success: false, message: 'orderId and returnToken required' });
    }
    if (!reason || !RETURN_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Valid return reason required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one item to return' });
    }

    let decoded;
    try {
      decoded = jwt.verify(returnToken, jwtSecret);
    } catch {
      return res.status(401).json({ success: false, message: 'Return verification expired. Please verify OTP again.' });
    }
    if (decoded.purpose !== 'return-request' || decoded.userId !== req.userId || decoded.orderId !== orderId) {
      return res.status(401).json({ success: false, message: 'Invalid return token' });
    }

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.user_id !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not your order' });
    }
    if (order.status !== 'Delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }
    if ((order.payment_method || 'cod') !== 'cod') {
      return res.status(400).json({ success: false, message: 'Return flow is for COD orders only' });
    }

    const history = Array.isArray(order.status_history) ? [...order.status_history] : [];
    const delivered = [...history].reverse().find(e => e.status === 'Delivered');
    const deliveredAt = new Date(delivered?.timestamp || order.updated_at || order.created_at);
    if (Date.now() - deliveredAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ success: false, message: '7-day return window has expired' });
    }

    const { data: existing } = await supabase
      .from('return_requests')
      .select('id, status')
      .eq('order_id', orderId)
      .maybeSingle();
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Return already ${existing.status.toLowerCase()} for this order`
      });
    }

    const { data: bank } = await supabase
      .from('bank_details')
      .select('*')
      .eq('user_id', req.userId)
      .maybeSingle();

    if (!bank) {
      return res.status(400).json({
        success: false,
        message: 'Please add your bank details before requesting a return',
        requiresBankDetails: true
      });
    }

    const orderItems = Array.isArray(order.items) ? order.items : [];
    const returnItems = [];
    let refundAmount = 0;

    for (const sel of items) {
      const pid = sel.productId || sel._id || sel.id;
      const qty = Number(sel.qty) || 1;
      const match = orderItems.find(i => (i.product_id || i._id || i.id) === pid);
      if (!match) {
        return res.status(400).json({ success: false, message: `Item ${pid} not in order` });
      }
      if (qty < 1 || qty > (match.qty || 1)) {
        return res.status(400).json({
          success: false,
          message: `Invalid qty for ${match.name}. Max: ${match.qty}`
        });
      }
      returnItems.push({
        productId: match.product_id || match._id || match.id,
        name: match.name,
        price: Number(match.price) || 0,
        qty,
        image: match.image || match.imageUrl || ''
      });
      refundAmount += (Number(match.price) || 0) * qty;
    }

    const bankSnapshot = {
      accountHolderName: bank.account_holder_name,
      accountNumber: bank.account_number,
      ifscCode: bank.ifsc_code,
      bankName: bank.bank_name,
      upiId: bank.upi_id || null
    };

    const now = new Date().toISOString();
    const { data: returnReq, error: insertErr } = await supabase
      .from('return_requests')
      .insert({
        order_id: orderId,
        user_id: req.userId,
        items: returnItems,
        reason,
        description: description || '',
        bank_details_snapshot: bankSnapshot,
        refund_amount: refundAmount,
        status: 'Pending',
        status_history: [{
          status: 'Pending',
          timestamp: now,
          updatedBy: 'Customer',
          note: 'Return request submitted'
        }],
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Return insert error:', insertErr);
      return res.status(500).json({ success: false, message: 'Failed to create return request' });
    }

    history.push({
      status: 'Return Requested',
      timestamp: now,
      updatedBy: 'Customer',
      details: `Return request ${returnReq.id} created. Refund ₹${refundAmount}`
    });
    await supabase.from('orders').update({
      status: 'Return Requested',
      status_history: history,
      updated_at: now
    }).eq('id', orderId);

    console.log(`↩️ Return requested: order ${orderId}, refund ₹${refundAmount}`);

    res.status(201).json({
      success: true,
      message: 'Return request submitted successfully',
      returnRequest: formatReturnRequest(returnReq)
    });
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/returns', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('return_requests')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, message: 'Error' });
    res.json({ success: true, returns: (data || []).map(formatReturnRequest) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.patch('/api/returns/:id/cancel', requireAuth, async (req, res) => {
  try {
    const { data: ret } = await supabase
      .from('return_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!ret) return res.status(404).json({ success: false, message: 'Return request not found' });
    if (ret.user_id !== req.userId) {
      return res.status(403).json({ success: false, message: 'Not your return request' });
    }
    if (ret.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel. Return is already ${ret.status}`
      });
    }

    const now = new Date().toISOString();
    const history = Array.isArray(ret.status_history) ? [...ret.status_history] : [];
    history.push({
      status: 'Cancelled',
      timestamp: now,
      updatedBy: 'Customer',
      note: 'Return request cancelled by user'
    });

    const { data: updated } = await supabase
      .from('return_requests')
      .update({ status: 'Cancelled', status_history: history, updated_at: now })
      .eq('id', req.params.id)
      .select()
      .single();

    const { data: order } = await supabase
      .from('orders')
      .select('status_history')
      .eq('id', ret.order_id)
      .single();

        const oHistory = Array.isArray(order?.status_history) ? [...order.status_history] : [];
    oHistory.push({
      status: 'Return Cancelled',   // 👈 alag status
      timestamp: now,
      updatedBy: 'System',
      details: 'Return cancelled by customer — order reinstated to Delivered'
    });

    await supabase.from('orders').update({
      status: 'Delivered',
      status_history: oHistory,
      updated_at: now
    }).eq('id', ret.order_id);

    res.json({ success: true, message: 'Return cancelled', returnRequest: formatReturnRequest(updated) });
  } catch (error) {
    console.error('Cancel return error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/admin/returns', requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = supabase.from('return_requests').select('*', { count: 'exact' });
    if (status && status !== 'all') query = query.eq('status', status);

    const skip = (Number(page) - 1) * Number(limit);
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(skip, skip + Number(limit) - 1);

    if (error) return res.status(500).json({ success: false, message: 'Error' });

    res.json({
      success: true,
      returns: (data || []).map(formatReturnRequest),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || data?.length || 0,
        pages: Math.ceil((count || data?.length || 0) / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.patch('/api/admin/returns/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const valid = ['Pending', 'Approved', 'Rejected', 'Pickup Scheduled', 'Refund Initiated', 'Refunded', 'Cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid return status' });
    }

    const { data: ret } = await supabase
      .from('return_requests')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!ret) return res.status(404).json({ success: false, message: 'Not found' });

    const now = new Date().toISOString();
    const history = Array.isArray(ret.status_history) ? [...ret.status_history] : [];
    history.push({
      status,
      timestamp: now,
      updatedBy: 'Admin',
      note: adminNote || `Status changed to ${status}`
    });

        // 👇 FIX — order status naming consistent rakho
    const orderStatusMap = {
      'Pending': 'Return Requested',
      'Approved': 'Return Approved',
      'Rejected': 'Return Rejected',
      'Pickup Scheduled': 'Return Pickup Scheduled',
      'Refund Initiated': 'Return Refund Initiated',
      'Refunded': 'Return Refunded',
      'Cancelled': 'Delivered'  // cancel pe order wapas Delivered
    };

    const { data: updated } = await supabase
      .from('return_requests')
      .update({
        status,
        admin_note: adminNote || ret.admin_note || null,
        status_history: history,
        updated_at: now
      })
      .eq('id', req.params.id)
      .select()
      .single();

    const { data: order } = await supabase
      .from('orders')
      .select('status_history')
      .eq('id', ret.order_id)
      .single();
    const oHistory = Array.isArray(order?.status_history) ? [...order.status_history] : [];
    oHistory.push({
      status: `Return ${status}`,
      timestamp: now,
      updatedBy: 'Admin',
      details: adminNote || ''
    });
        await supabase.from('orders').update({
      status: orderStatusMap[status] || `Return ${status}`,
      status_history: oHistory,
      updated_at: now
    }).eq('id', ret.order_id);

    res.json({
      success: true,
      message: `Return ${status}`,
      returnRequest: formatReturnRequest(updated)
    });
  } catch (error) {
    console.error('Admin return status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =============================================
// HEALTH
// =============================================
app.get('/health', async (req, res) => {
  try {
    const { error } = await supabase.from('products').select('id').limit(1);
    res.status(error ? 503 : 200).json({ status: error ? 'DEGRADED' : 'OK' });
  } catch {
    res.status(503).json({ status: 'DEGRADED' });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'VELQRA API',
    status: 'running'
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  const status = Number(err.status) || 500;
  if (status >= 500) console.error('Unhandled request error:', err.code || err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Video too large (max 50MB)' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message || 'Invalid request'
  });
});

ensureBootstrapAdmin().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 VELQRA Server running on port ${port}`);
    console.log(`📍 Health: http://localhost:${port}/health`);
    console.log(`📁 Uploads: ${uploadsDir}`);
    console.log(`📱 SMS: ${fast2smsApiKey ? (smsTestMode ? '🧪 Test Mode' : 'Live') : 'Not configured'}`);
    console.log(`📧 Email: ❌ DISABLED`);
  });
}).catch(error => {
  console.error('Admin account initialization failed:', error.code || 'database error');
  process.exitCode = 1;
});