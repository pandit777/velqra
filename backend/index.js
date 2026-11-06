const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const WebSocket = require('ws');

// Load environment variables
dotenv.config();

const app = express();

// =============================================
// ENVIRONMENT VARIABLES CHECK
// =============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? ''
  : 'atelimarket_local_development_secret');
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || 'noreply@atelimarket.shop';
const emailFromName = process.env.EMAIL_FROM_NAME || 'AteliMarket';

console.log('🚀 Starting AteliMarket Backend with Supabase...');
console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔗 Supabase URL: ${supabaseUrl ? '✅ Set' : '❌ Not Set'}`);
console.log(`📧 Resend API: ${resendApiKey ? '✅ Configured' : '❌ Not Set'}`);
console.log(`📧 From Email: ${emailFrom} ✅ Verified Domain`);

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Supabase credentials are missing!');
  process.exit(1);
}

if (!jwtSecret && process.env.NODE_ENV === 'production') {
  console.error('❌ JWT_SECRET is missing!');
  process.exit(1);
}

// =============================================
// SUPABASE CLIENT
// =============================================
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    transport: {
      WebSocket: WebSocket
    }
  }
});
console.log('✅ Supabase client initialized with WebSocket support');

// =============================================
// RESEND EMAIL SETUP
// =============================================
let resend = null;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
  console.log('✅ Resend API initialized');
}

async function sendOTPEmail(email, otp, name = 'User', type = 'reset') {
  try {
    if (!resend) {
      console.error('❌ Resend not initialized');
      return false;
    }

    const subject = type === 'reset' 
      ? '🔐 AteliMarket - Password Reset OTP' 
      : '📧 AteliMarket - Verify Your Account';

    const { data, error } = await resend.emails.send({
      from: `${emailFromName} <${emailFrom}>`,
      to: email,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f6f9;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f6f9; padding: 20px 0;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #0B3C5D 0%, #1a5a7a 100%); padding: 30px 20px; text-align: center;">
                      <h1 style="color: white; margin: 0; font-size: 28px;">ATELI<span style="color: #FF5722;">MARKET</span></h1>
                      <p style="color: rgba(255,255,255,0.8); font-size: 14px;">${type === 'reset' ? 'Secure Password Reset' : 'Verify Your Account'}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 35px 30px;">
                      <h2 style="color: #0B3C5D;">Hello ${name} 👋</h2>
                      <p style="color: #4a5568; font-size: 16px;">
                        ${type === 'reset' 
                          ? 'We received a request to reset your password.' 
                          : 'Welcome to AteliMarket! Please verify your account.'}
                      </p>
                      <div style="background: #f0f4f8; padding: 20px; text-align: center; font-size: 42px; font-weight: bold; letter-spacing: 12px; border-radius: 8px; margin: 20px 0;">
                        ${otp}
                      </div>
                      <p style="color: #666; font-size: 14px;">⏰ Valid for <strong>10 minutes</strong></p>
                      <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
                      <p style="color: #718096; font-size: 12px; text-align: center;">© 2025 AteliMarket. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('❌ Resend error:', error);
      return false;
    }

    console.log('✅ OTP email sent to:', email);
    return true;
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return false;
  }
}

// =============================================
// CORS CONFIGURATION
// =============================================
const allowedOrigins = [
  'https://atelimarket.shop',
  'https://www.atelimarket.shop',
  'http://atelimarket.shop',
  'http://www.atelimarket.shop',
  'https://atelimarket-frontend-xzjb.onrender.com',
  'https://atelimarket-backend-e46c.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:10000',
  '*.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin?.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =============================================
// STATIC FILES
// =============================================
const uploadsDir = path.join(__dirname, 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=31536000');
  }
}));
console.log(`📁 Uploads directory: ${uploadsDir}`);

// =============================================
// DELIVERY CHARGE CALCULATION
// =============================================
const calculateDeliveryCharge = (subtotal) => {
  if (subtotal >= 199) return 0;
  return 20;
};

// =============================================
// HELPER FUNCTIONS
// =============================================

const formatUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name || 'User',
    email: user.email,
    phone: user.phone || '',
    role: user.role || 'user',
    isVerified: user.is_verified || false,
    createdAt: user.created_at || user.createdAt
  };
};

const formatProduct = (product) => {
  if (!product) return null;
  return {
    _id: product.id,
    id: product.id,
    name: product.name || 'Product',
    price: product.price || 0,
    originalPrice: product.original_price || 0,
    discountPercent: product.discount_percent || 0,
    category: product.category || 'Uncategorized',
    stock: product.stock || 10,
    description: product.description || '',
    image: product.image || '',
    imageUrl: product.image_url || '',
    images: product.images || [],
    brand: product.brand || '',
    weight: product.weight || null,
    dimensions: product.dimensions || null,
    color: product.color || '',
    size: product.size || '',
    material: product.material || '',
    warranty: product.warranty || '',
    tags: product.tags || [],
    icon: product.icon || '📦',
    rating: product.rating || 0,
    reviewsCount: product.reviews_count || 0,
    popularity: product.popularity || 0,
    promoCode: product.promo_code || '',
    promoDiscount: Number(product.promo_discount || 0),
    isActive: product.is_active !== false,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    mainImage: product.image || product.image_url || (product.images && product.images.length > 0 ? product.images[0] : ''),
    videoUrl: product.video_url || null,
    videoType: product.video_type || 'youtube'
  };
};

const formatCartItem = (item) => {
  return {
    productId: item.product_id,
    name: item.name,
    price: item.price,
    originalPrice: item.original_price || 0,
    discountPercent: item.discount_percent || 0,
    qty: item.qty,
    image: item.image || '',
    imageUrl: item.image_url || '',
    stock: item.stock || 0,
    category: item.category || '',
    selectedAttributes: item.selected_attributes || {}
  };
};

const formatCart = (cart) => {
  if (!cart) {
    return {
      items: [],
      totalItems: 0,
      totalPrice: 0,
      totalSavings: 0,
      updatedAt: new Date().toISOString()
    };
  }
  
  const items = cart.items?.map(formatCartItem) || [];
  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const totalSavings = items.reduce((sum, item) => {
    return sum + ((item.originalPrice - item.price) * item.qty);
  }, 0);

  return {
    items,
    totalItems,
    totalPrice,
    totalSavings,
    updatedAt: cart.updated_at || new Date().toISOString()
  };
};

const formatOrder = (order) => {
  if (!order) return null;
  return {
    _id: order.id,
    id: order.id,
    userId: order.user_id,
    userName: order.user_name || 'Guest',
    userEmail: order.user_email || '',
    items: order.items || [],
    total: order.total,
    paymentMethod: order.payment_method || 'cod',
    referenceId: order.reference_id || null,
    delivery: order.delivery || {},
    status: order.status || 'Pending',
    statusHistory: order.status_history || [],
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
};

// =============================================
// AUTH ROUTES
// =============================================

// Register - Send OTP
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;
    const normalizedPhone = String(phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required: name, email, phone, password, confirmPassword' 
      });
    }

    if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Gmail address'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Passwords do not match' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit Indian mobile number'
      });
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .or(`email.eq.${normalizedEmail},phone.eq.${normalizedPhone}`)
      .single();
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User already exists with this email or phone number' 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('📝 Generated OTP for registration:', otp);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { error: otpError } = await supabase
      .from('registration_otps')
      .upsert({
        email: normalizedEmail,
        otp: otp,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
        data: {
          name: name,
          phone: normalizedPhone,
          password: password
        }
      }, {
        onConflict: 'email'
      });

    if (otpError) {
      console.error('Error saving OTP:', otpError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate OTP' 
      });
    }

    console.log('✅ Registration OTP stored successfully');

    setImmediate(async () => {
      const sent = await sendOTPEmail(normalizedEmail, otp, name, 'register');
      if (!sent) {
        console.log('📧 OTP (email failed):', otp);
      }
    });

    res.json({
      success: true,
      message: 'OTP sent successfully to your email. Please verify to complete registration.',
      email: normalizedEmail,
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration' 
    });
  }
});

// Verify Registration OTP
app.post('/api/auth/verify-registration', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    
    if (!normalizedEmail || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and OTP are required' 
      });
    }

    console.log('🔍 Verifying registration OTP for:', normalizedEmail);

    const { data: otpData, error: otpError } = await supabase
      .from('registration_otps')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({ 
        success: false, 
        message: 'No OTP found. Please request a new OTP.' 
      });
    }

    const now = new Date();
    const expiry = new Date(otpData.expires_at);

    if (now > expiry) {
      await supabase
        .from('registration_otps')
        .delete()
        .eq('email', normalizedEmail);
      
      return res.status(400).json({ 
        success: false, 
        message: 'OTP has expired. Please request a new OTP.' 
      });
    }

    if (String(otpData.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP. Please try again.' 
      });
    }

    console.log('✅ Registration OTP verified successfully');

    const userData = otpData.data || {};
    const { name, phone, password } = userData;

    if (!name || !phone || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Registration data not found. Please try again.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        name: name,
        email: normalizedEmail,
        phone: phone,
        password: hashedPassword,
        role: 'user',
        is_verified: true
      })
      .select()
      .single();

    if (userError) {
      console.error('User creation error:', userError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to create user' 
      });
    }

    await supabase
      .from('registration_otps')
      .delete()
      .eq('email', normalizedEmail);

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      jwtSecret,
      { expiresIn: '7d' }
    );

    console.log('✅ User registered successfully:', normalizedEmail);

    res.status(201).json({
      success: true,
      message: 'Registration completed successfully!',
      token: token,
      user: formatUser(user)
    });

  } catch (error) {
    console.error('Registration verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration' 
    });
  }
});

// Resend Registration OTP
app.post('/api/auth/resend-registration-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    
    if (!normalizedEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    console.log('🔄 Resending registration OTP for:', normalizedEmail);

    const { data: otpData, error: otpError } = await supabase
      .from('registration_otps')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (otpError || !otpData) {
      return res.status(400).json({ 
        success: false, 
        message: 'No registration found. Please start registration again.' 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('📝 New OTP:', otp);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { error: updateError } = await supabase
      .from('registration_otps')
      .update({
        otp: otp,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('email', normalizedEmail);

    if (updateError) {
      console.error('Error updating OTP:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to resend OTP' 
      });
    }

    const name = otpData.data?.name || 'User';

    setImmediate(async () => {
      const sent = await sendOTPEmail(normalizedEmail, otp, name, 'register');
      if (!sent) {
        console.log('📧 OTP (email failed):', otp);
      }
    });

    res.json({
      success: true,
      message: 'OTP resent successfully',
      email: normalizedEmail,
      expiresAt: expiresAt
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to resend OTP' 
    });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password required' 
      });
    }
    
    const identifier = email.trim();
    const normalizedEmail = identifier.toLowerCase();
    const normalizedPhone = identifier.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10);
    const isEmail = identifier.includes('@');

    if (!isEmail && normalizedPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid Gmail address or 10-digit mobile number'
      });
    }
    console.log(`🔍 Login attempt: ${normalizedEmail}`);
    
    // Check admins table
    let adminQuery = supabase.from('admins').select('*');
    const { data: admin, error: adminError } = isEmail
      ? await adminQuery.ilike('email', normalizedEmail).single()
      : await supabase.from('admins').select('*').ilike('phone', `%${normalizedPhone}%`).single();
    
    if (admin) {
      console.log('📊 Admin found, verifying password...');
      
      const isValid = await bcrypt.compare(password, admin.password);
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }
      
      const token = jwt.sign(
        { userId: admin.id, email: admin.email, role: admin.role || 'admin' },
        jwtSecret,
        { expiresIn: '7d' }
      );
      
      console.log('✅ Admin logged in!');
      
      return res.json({
        success: true,
        token,
        user: {
          id: admin.id,
          email: admin.email,
          name: admin.name || 'Admin',
          role: admin.role || 'admin'
        }
      });
    }
    
    // Check users table
    let userQuery = supabase.from('users').select('*');
    const { data: user, error: findError } = isEmail
      ? await userQuery.ilike('email', normalizedEmail).single()
      : await supabase.from('users').select('*').ilike('phone', `%${normalizedPhone}%`).single();
    
    if (findError || !user) {
      console.log('❌ User not found');
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    if (!user.is_verified) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please verify your email first. Check your inbox for OTP.' 
      });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      jwtSecret,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: formatUser(user)
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

// Verify token
app.get('/api/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, jwtSecret);
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, phone, role, is_verified, created_at')
      .eq('id', decoded.userId)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, user: formatUser(user) });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// =============================================
// 🔐 FORGOT PASSWORD - EMAIL CHECK FIRST
// =============================================

// 1. Send OTP - ✅ CHECK USER FIRST
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('🔑 Forgot password for:', normalizedEmail);

    // ✅ STEP 1: Check if user exists in users table
    console.log('🔍 Checking users table...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, name')
      .ilike('email', normalizedEmail)
      .single();

    // ✅ STEP 2: Check if admin exists
    console.log('🔍 Checking admins table...');
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id, email, name')
      .ilike('email', normalizedEmail)
      .single();

    // ✅ STEP 3: If no user found, return error
    if ((userError || !user) && (adminError || !admin)) {
      console.log('❌ No account found for:', normalizedEmail);
      return res.status(404).json({ 
        success: false, 
        message: 'No account found with this email. Please register first.' 
      });
    }

    const userName = user?.name || admin?.name || 'User';
    console.log('✅ User found:', userName);

    // ✅ STEP 4: Generate OTP (only if user exists)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('📝 Generated OTP:', otp);

    // Delete old OTP
    await supabase
      .from('password_resets')
      .delete()
      .ilike('email', normalizedEmail);

    // Insert new OTP
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const { error: insertError } = await supabase
      .from('password_resets')
      .insert({
        email: normalizedEmail,
        otp: otp,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Error saving OTP:', insertError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate OTP' 
      });
    }

    console.log('✅ OTP stored successfully');

    // ✅ STEP 5: Send response immediately
    res.json({
      success: true,
      message: 'OTP sent successfully to your email',
      email: normalizedEmail,
      expiresAt: expiresAt
    });

    // ✅ STEP 6: Send email in background
    setImmediate(async () => {
      const sent = await sendOTPEmail(normalizedEmail, otp, userName, 'reset');
      if (!sent) {
        console.log('📧 OTP (email failed):', otp);
      }
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process request' 
    });
  }
});

// 2. Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and OTP are required' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('🔍 Verifying OTP for:', normalizedEmail);

    const { data: resetData, error: resetError } = await supabase
      .from('password_resets')
      .select('*')
      .ilike('email', normalizedEmail)
      .single();

    if (resetError || !resetData) {
      return res.status(400).json({ 
        success: false, 
        message: 'No OTP found. Please request a new OTP.' 
      });
    }

    const now = new Date();
    const expiry = new Date(resetData.expires_at);

    if (now > expiry) {
      await supabase
        .from('password_resets')
        .delete()
        .ilike('email', normalizedEmail);
      
      return res.status(400).json({ 
        success: false, 
        message: 'OTP has expired. Please request a new OTP.' 
      });
    }

    if (String(resetData.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP. Please try again.' 
      });
    }

    console.log('✅ OTP verified successfully for:', normalizedEmail);

    // Generate reset token
    const resetToken = jwt.sign(
      { email: normalizedEmail, purpose: 'reset-password' },
      jwtSecret,
      { expiresIn: '10m' }
    );

    // Delete OTP after successful verification
    await supabase
      .from('password_resets')
      .delete()
      .ilike('email', normalizedEmail);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      email: normalizedEmail,
      resetToken: resetToken
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify OTP' 
    });
  }
});

// 3. Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body;
    
    const normalizedEmail = email?.trim().toLowerCase();
    console.log('🔑 Reset password for:', normalizedEmail);

    if (!normalizedEmail || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and new password are required' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    if (!resetToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Reset token is required' 
      });
    }

    // ✅ Verify reset token
    try {
      const decoded = jwt.verify(resetToken, jwtSecret);
      if (decoded.email !== normalizedEmail || decoded.purpose !== 'reset-password') {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid reset token' 
        });
      }
      console.log('✅ Reset token verified');
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ✅ Update user password
    const { data: user, error: userError } = await supabase
      .from('users')
      .update({ 
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .ilike('email', normalizedEmail)
      .select();

    if (user && user.length > 0) {
      console.log('✅ User password updated:', normalizedEmail);
      await supabase.from('password_resets').delete().ilike('email', normalizedEmail);
      
      return res.json({
        success: true,
        message: 'Password reset successfully!'
      });
    }

    // ✅ Update admin password
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .update({ 
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .ilike('email', normalizedEmail)
      .select();

    if (admin && admin.length > 0) {
      console.log('✅ Admin password updated:', normalizedEmail);
      await supabase.from('password_resets').delete().ilike('email', normalizedEmail);
      
      return res.json({
        success: true,
        message: 'Password reset successfully!'
      });
    }

    // ❌ User not found
    console.error('❌ User not found:', normalizedEmail);
    return res.status(404).json({ 
      success: false, 
      message: 'No account found with this email. Please register first.' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reset password' 
    });
  }
});

// =============================================
// PRODUCTS ROUTES
// =============================================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Fetching products...');
    
    const { category, search, sort } = req.query;
    
    let query = supabase.from('products').select('*');
    
    if (category && category !== 'All') {
      query = query.eq('category', category);
    }
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%,description.ilike.%${search}%`);
    }
    
    if (sort === 'price-low') {
      query = query.order('price', { ascending: true });
    } else if (sort === 'price-high') {
      query = query.order('price', { ascending: false });
    } else if (sort === 'name') {
      query = query.order('name', { ascending: true });
    } else if (sort === 'discount') {
      query = query.order('discount_percent', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }
    
    const { data: products, error } = await query;
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching products',
        error: error.message 
      });
    }
    
    console.log(`✅ Found ${products?.length || 0} products`);
    
    const formattedProducts = products.map(formatProduct);
    res.json({ success: true, products: formattedProducts });
    
  } catch (error) {
    console.error('❌ Products error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching products' 
    });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, product: formatProduct(product) });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Error fetching product' });
  }
});

// Add Product
app.post('/api/products/add', async (req, res) => {
  try {
    console.log('📦 Adding product with URL...');
    console.log('Body:', req.body);

    const { 
      name, 
      originalPrice, 
      discountPercent, 
      category, 
      stock, 
      description, 
      icon,
      imageUrl,
      images,
      brand,
      weight,
      color,
      size,
      material,
      warranty,
      tags,
      promoCode,
      promoDiscount,
      videoUrl,
      videoType
    } = req.body;

    if (!name || !originalPrice || !imageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, original price and image URL are required' 
      });
    }

    const normalizedPromoCode = promoCode ? String(promoCode).trim().toUpperCase() : '';
    const normalizedPromoDiscount = parseFloat(promoDiscount) || 0;
    if ((normalizedPromoCode && (normalizedPromoDiscount <= 0 || normalizedPromoDiscount > 100)) ||
      (!normalizedPromoCode && normalizedPromoDiscount > 0)) {
      return res.status(400).json({
        success: false,
        message: 'Promo code and discount must both be provided, with discount between 1 and 100.'
      });
    }

    let finalPrice = parseFloat(originalPrice);
    const discount = parseFloat(discountPercent) || 0;
    
    if (discount > 0) {
      finalPrice = finalPrice - (finalPrice * (discount / 100));
    }

    let parsedImages = [];
    if (images) {
      try {
        parsedImages = typeof images === 'string' ? JSON.parse(images) : images;
      } catch (e) {
        parsedImages = images.split(',').map(img => img.trim());
      }
    }

    if (imageUrl && parsedImages.length === 0) {
      parsedImages = [imageUrl.trim()];
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(t => t.trim());
      }
    }

    const productData = {
      name: name.trim(),
      original_price: parseFloat(originalPrice),
      price: Math.round(finalPrice),
      discount_percent: discount,
      category: category || 'Groceries',
      stock: parseInt(stock) || 10,
      description: description || '',
      icon: icon || '📦',
      image: imageUrl.trim(),
      image_url: imageUrl.trim(),
      images: parsedImages,
      brand: brand || '',
      weight: weight || null,
      color: color || '',
      size: size || '',
      material: material || '',
      warranty: warranty || '',
      tags: parsedTags,
      promo_code: normalizedPromoCode,
      promo_discount: normalizedPromoDiscount,
      is_active: true,
      rating: 0,
      reviews_count: 0,
      popularity: 0,
      video_url: videoUrl || null,
      video_type: videoType || 'youtube'
    };

    const { data: product, error } = await supabase
      .from('products')
      .insert(productData)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error adding product',
        error: error.message 
      });
    }
    
    console.log(`✅ Product added successfully: ${product.name}`);
    res.status(201).json({ 
      success: true, 
      message: 'Product added successfully', 
      product: formatProduct(product) 
    });
    
  } catch (error) {
    console.error('❌ Error adding product:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding product',
      error: error.message 
    });
  }
});

// Update Product
app.put('/api/products/update/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const updates = req.body;
    
    const { data: currentProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();
    
    if (fetchError || !currentProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const updateData = {};
    
    if (updates.name) updateData.name = updates.name.trim();
    if (updates.originalPrice) {
      updateData.original_price = parseFloat(updates.originalPrice);
      const disc = updates.discountPercent !== undefined ? parseFloat(updates.discountPercent) : currentProduct.discount_percent;
      updateData.price = Math.round(updateData.original_price - (updateData.original_price * (disc / 100)));
    }
    if (updates.discountPercent !== undefined) {
      updateData.discount_percent = parseFloat(updates.discountPercent);
      const origPrice = updateData.original_price || currentProduct.original_price;
      updateData.price = Math.round(origPrice - (origPrice * (updateData.discount_percent / 100)));
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
      try {
        updateData.images = typeof updates.images === 'string' ? JSON.parse(updates.images) : updates.images;
      } catch (e) {
        updateData.images = updates.images.split(',').map(img => img.trim());
      }
    }
    if (updates.brand !== undefined) updateData.brand = updates.brand.trim();
    if (updates.weight !== undefined) updateData.weight = updates.weight || null;
    if (updates.color !== undefined) updateData.color = updates.color.trim();
    if (updates.size !== undefined) updateData.size = updates.size.trim();
    if (updates.material !== undefined) updateData.material = updates.material.trim();
    if (updates.warranty !== undefined) updateData.warranty = updates.warranty.trim();
    if (updates.tags !== undefined) {
      try {
        updateData.tags = typeof updates.tags === 'string' ? JSON.parse(updates.tags) : updates.tags;
      } catch (e) {
        updateData.tags = updates.tags.split(',').map(t => t.trim());
      }
    }
    if (updates.videoUrl !== undefined) {
      updateData.video_url = updates.videoUrl || null;
    }
    if (updates.promoCode !== undefined) {
      updateData.promo_code = String(updates.promoCode).trim().toUpperCase();
    }
    if (updates.promoDiscount !== undefined) {
      updateData.promo_discount = Math.min(100, Math.max(0, parseFloat(updates.promoDiscount) || 0));
    }
    if (updates.videoType !== undefined) {
      updateData.video_type = updates.videoType || 'youtube';
    }

    const { data: product, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase update error:', error);
      return res.status(500).json({ success: false, message: 'Error updating product' });
    }
    
    console.log(`✅ Product updated: ${product.name}`);
    res.json({ success: true, message: 'Product updated successfully', product: formatProduct(product) });
    
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Error updating product' });
  }
});

// Delete Product
app.delete('/api/products/delete/:id', async (req, res) => {
  try {
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('name')
      .eq('id', req.params.id)
      .single();
    
    if (fetchError || !product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);
    
    if (error) {
      console.error('Supabase delete error:', error);
      return res.status(500).json({ success: false, message: 'Error deleting product' });
    }
    
    console.log(`🗑️ Product deleted: ${product.name}`);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Error deleting product' });
  }
});

// =============================================
// CART ROUTES
// =============================================

// Get user cart
app.get('/api/cart', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to view cart' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (userError || !user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    let { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (cartError && cartError.code === 'PGRST116') {
      const { data: newCart, error: createError } = await supabase
        .from('carts')
        .insert({
          user_id: userId,
          items: [],
          total_items: 0,
          total_price: 0,
          total_savings: 0
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating cart:', createError);
        return res.status(500).json({ success: false, message: 'Error creating cart' });
      }
      cart = newCart;
    } else if (cartError) {
      console.error('Error fetching cart:', cartError);
      return res.status(500).json({ success: false, message: 'Error fetching cart' });
    }

    res.json({
      success: true,
      cart: formatCart(cart)
    });

  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching cart',
      error: error.message 
    });
  }
});

// Add to cart
app.post('/api/cart/add', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to add to cart' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const { productId, qty = 1, selectedAttributes = {} } = req.body;

    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID is required' 
      });
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();
    
    if (productError || !product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }

    if (product.stock <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product is out of stock' 
      });
    }

    let { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .single();

    let items = [];
    if (cart && !cartError) {
      items = cart.items || [];
    }

    const existingIndex = items.findIndex(item => 
      item.product_id === productId && 
      JSON.stringify(item.selected_attributes || {}) === JSON.stringify(selectedAttributes)
    );

    if (existingIndex > -1) {
      const newQty = items[existingIndex].qty + qty;
      if (newQty > product.stock) {
        return res.status(400).json({ 
          success: false, 
          message: 'Not enough stock available' 
        });
      }
      items[existingIndex].qty = newQty;
    } else {
      items.push({
        product_id: product.id,
        name: product.name,
        price: product.price,
        original_price: product.original_price,
        discount_percent: product.discount_percent || 0,
        qty: qty,
        image: product.image || '',
        image_url: product.image_url || '',
        stock: product.stock,
        category: product.category,
        selected_attributes: selectedAttributes
      });
    }

    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalSavings = items.reduce((sum, item) => {
      return sum + ((item.original_price - item.price) * item.qty);
    }, 0);

    const { data: updatedCart, error: upsertError } = await supabase
      .from('carts')
      .upsert({
        user_id: userId,
        items: items,
        total_items: totalItems,
        total_price: totalPrice,
        total_savings: totalSavings,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error updating cart:', upsertError);
      return res.status(500).json({ success: false, message: 'Error adding to cart' });
    }

    res.json({
      success: true,
      message: 'Product added to cart',
      cart: formatCart(updatedCart)
    });

  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error adding to cart',
      error: error.message 
    });
  }
});

// Update cart item quantity
app.put('/api/cart/update/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const { productId } = req.params;
    const { qty, selectedAttributes = {} } = req.body;

    if (!qty || qty < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid quantity is required' 
      });
    }

    const { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (cartError || !cart) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cart not found' 
      });
    }

    let items = cart.items || [];
    const itemIndex = items.findIndex(item => 
      item.product_id === productId && 
      JSON.stringify(item.selected_attributes || {}) === JSON.stringify(selectedAttributes)
    );

    if (itemIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found in cart' 
      });
    }

    if (qty === 0) {
      items.splice(itemIndex, 1);
    } else {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('stock')
        .eq('id', productId)
        .single();
      
      if (product && qty > product.stock) {
        return res.status(400).json({ 
          success: false, 
          message: 'Not enough stock available' 
        });
      }
      items[itemIndex].qty = qty;
    }

    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalSavings = items.reduce((sum, item) => {
      return sum + ((item.original_price - item.price) * item.qty);
    }, 0);

    const { data: updatedCart, error: updateError } = await supabase
      .from('carts')
      .update({
        items: items,
        total_items: totalItems,
        total_price: totalPrice,
        total_savings: totalSavings,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating cart:', updateError);
      return res.status(500).json({ success: false, message: 'Error updating cart' });
    }

    res.json({
      success: true,
      message: 'Cart updated',
      cart: formatCart(updatedCart)
    });

  } catch (error) {
    console.error('Error updating cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating cart',
      error: error.message 
    });
  }
});

// Remove from cart
app.delete('/api/cart/remove/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const { productId } = req.params;
    const { selectedAttributes = {} } = req.body;

    const { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (cartError || !cart) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cart not found' 
      });
    }

    let items = cart.items || [];
    items = items.filter(item => 
      !(item.product_id === productId && 
        JSON.stringify(item.selected_attributes || {}) === JSON.stringify(selectedAttributes))
    );

    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalSavings = items.reduce((sum, item) => {
      return sum + ((item.original_price - item.price) * item.qty);
    }, 0);

    const { data: updatedCart, error: updateError } = await supabase
      .from('carts')
      .update({
        items: items,
        total_items: totalItems,
        total_price: totalPrice,
        total_savings: totalSavings,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating cart:', updateError);
      return res.status(500).json({ success: false, message: 'Error removing from cart' });
    }

    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: formatCart(updatedCart)
    });

  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error removing from cart',
      error: error.message 
    });
  }
});

// Clear cart
app.delete('/api/cart/clear', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;

    const { error } = await supabase
      .from('carts')
      .update({
        items: [],
        total_items: 0,
        total_price: 0,
        total_savings: 0,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing cart:', error);
      return res.status(500).json({ success: false, message: 'Error clearing cart' });
    }

    res.json({
      success: true,
      message: 'Cart cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error clearing cart',
      error: error.message 
    });
  }
});

// Sync local cart to server
app.post('/api/cart/sync', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cart items' 
      });
    }

    const processedItems = [];
    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', item._id)
        .single();
      
      if (productError || !product) continue;

      const qty = Math.min(item.qty, product.stock);
      if (qty <= 0) continue;

      processedItems.push({
        product_id: product.id,
        name: product.name,
        price: product.price,
        original_price: product.original_price,
        discount_percent: product.discount_percent || 0,
        qty: qty,
        image: product.image || '',
        image_url: product.image_url || '',
        stock: product.stock,
        category: product.category,
        selected_attributes: item.selectedAttributes || {}
      });
    }

    const totalItems = processedItems.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = processedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalSavings = processedItems.reduce((sum, item) => {
      return sum + ((item.original_price - item.price) * item.qty);
    }, 0);

    const { data: cart, error: upsertError } = await supabase
      .from('carts')
      .upsert({
        user_id: userId,
        items: processedItems,
        total_items: totalItems,
        total_price: totalPrice,
        total_savings: totalSavings,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error syncing cart:', upsertError);
      return res.status(500).json({ success: false, message: 'Error syncing cart' });
    }

    res.json({
      success: true,
      message: 'Cart synced successfully',
      cart: formatCart(cart)
    });

  } catch (error) {
    console.error('Error syncing cart:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error syncing cart',
      error: error.message 
    });
  }
});

// =============================================
// ORDER ROUTES
// =============================================

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    console.log('📦 Creating order...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { items, total, paymentMethod, referenceId, delivery } = req.body;

    if (paymentMethod === 'cod') {
      const primaryPhone = String(delivery?.phone || '').replace(/\D/g, '');
      const alternatePhone = String(delivery?.alternatePhone || '').replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(alternatePhone)) {
        return res.status(400).json({ success: false, message: 'Alternate phone number is required for COD orders.' });
      }
      if (!/^[6-9]\d{9}$/.test(primaryPhone)) {
        return res.status(400).json({ success: false, message: 'Primary phone number is required for COD orders.' });
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    if (!total || isNaN(total) || total <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid total amount'
      });
    }

    if (!delivery || typeof delivery !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Delivery details are required'
      });
    }

    const requiredFields = ['fullName', 'phone', 'address', 'city', 'state', 'pincode'];
    const missingFields = requiredFields.filter(field => !String(delivery[field] || '').trim());

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    let userId = null;
    let userName = 'Guest';
    let userEmail = '';

    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');

    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, jwtSecret);
        userId = decoded.userId;
        
        const { data: admin, error: adminError } = await supabase
          .from('admins')
          .select('email')
          .eq('id', userId)
          .single();
        
        if (!adminError && admin) {
          userName = 'Admin';
          userEmail = admin.email || '';
          console.log(`👤 Admin ordering: ${userName} (${userEmail})`);
          userId = null;
        } else {
          const { data: user, error: userError } = await supabase
            .from('users')
            .select('name, email, phone')
            .eq('id', userId)
            .single();
          
          if (!userError && user) {
            userName = user.name || 'Guest';
            userEmail = user.email || '';
            if (paymentMethod === 'cod') {
              const registeredPhone = String(user.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
              const primaryPhone = String(delivery.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
              if (!registeredPhone || primaryPhone !== registeredPhone) {
                return res.status(400).json({
                  success: false,
                  message: 'Primary phone number must match your registered mobile number.'
                });
              }
            }

            if (paymentMethod === 'cod' && !userId) {
              return res.status(401).json({
                success: false,
                message: 'Please login before placing a COD order.'
              });
            }
            console.log(`👤 User: ${userName} (${userEmail})`);
          }
        }
      } catch (err) {
        console.log('⚠️ Token verification failed, proceeding as guest:', err.message);
      }
    }

    const initialStatus = paymentMethod === 'online' ? 'Payment Verification Pending' : 'Pending';

    const orderItems = items.map(item => ({
      product_id: item._id || item.productId || null,
      name: String(item.name || 'Product'),
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
      image: String(item.image || item.imageUrl || ''),
      originalPrice: Number(item.originalPrice) || Number(item.original_price) || 0,
      discountPercent: Number(item.discountPercent) || Number(item.discount_percent) || 0,
      category: String(item.category || ''),
      selectedAttributes: item.selectedAttributes || {}
    }));

    const orderData = {
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      items: orderItems,
      total: Number(total),
      payment_method: paymentMethod || 'cod',
      reference_id: referenceId || null,
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
        status: initialStatus,
        timestamp: new Date().toISOString(),
        updatedBy: 'System'
      }]
    };

    console.log('💾 Order data to save:', JSON.stringify(orderData, null, 2));

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error('Supabase insert error:', orderError);
      return res.status(500).json({
        success: false,
        message: 'Failed to place order',
        error: orderError.message
      });
    }

    if (userId) {
      const { error: cartError } = await supabase
        .from('carts')
        .update({
          items: [],
          total_items: 0,
          total_price: 0,
          total_savings: 0,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
      
      if (!cartError) {
        console.log('🗑️ Cart cleared after order');
      }
    }

    console.log(`✅ Order placed successfully! ID: ${order.id}`);
    
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: formatOrder(order)
    });

  } catch (error) {
    console.error('❌ Error creating order:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to place order',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user orders
app.get('/api/orders', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Please login to view orders' });
    }
    
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.userId;
    
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('id', userId)
      .single();
    
    let query = supabase.from('orders').select('*');
    
    if (admin) {
      console.log('👑 Admin viewing all orders');
      query = query.order('created_at', { ascending: false });
    } else {
      console.log('👤 User viewing own orders');
      query = query.eq('user_id', userId).order('created_at', { ascending: false });
    }
    
    const { data: orders, error } = await query;
    
    if (error) {
      console.error('Error fetching orders:', error);
      return res.status(500).json({ success: false, message: 'Error fetching orders' });
    }
    
    console.log(`📊 Found ${orders?.length || 0} orders`);
    res.json({ success: true, orders: orders.map(formatOrder) });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Error fetching orders' });
  }
});

// Get order tracking
app.get('/api/orders/:id/tracking', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (error || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, jwtSecret);
        const userId = decoded.userId;
        
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single();
        
        const { data: admin, error: adminError } = await supabase
          .from('admins')
          .select('id')
          .eq('id', userId)
          .single();
        
        const isAdmin = (user && user.role === 'admin') || admin;
        const isOwner = order.user_id === userId;
        
        if (isAdmin || isOwner) {
          const timeline = getOrderTimeline(order);
          
          return res.json({
            success: true,
            tracking: {
              orderId: order.id,
              currentStatus: order.status,
              createdAt: order.created_at,
              items: order.items,
              total: order.total,
              delivery: order.delivery,
              timeline: timeline,
              statusHistory: order.status_history || []
            }
          });
        }
      } catch (err) {
        console.error('Token verification error:', err);
      }
    }
    
    return res.status(403).json({ success: false, message: 'Unauthorized to view this order' });
    
  } catch (error) {
    console.error('Error fetching tracking:', error);
    res.status(500).json({ success: false, message: 'Error fetching tracking details' });
  }
});

// =============================================
// VERIFY PAYMENT - ADMIN ONLY
// =============================================
app.patch('/api/orders/:id/verify-payment', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    const userId = decoded.userId;
    
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('id', userId)
      .single();
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    
    const isAdmin = admin || (user && user.role === 'admin');
    
    if (!isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required to verify payments' 
      });
    }
    
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (fetchError || !order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (order.status !== 'Payment Verification Pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot verify payment. Current status: ${order.status}` 
      });
    }
    
    const statusHistory = order.status_history || [];
    statusHistory.push({
      status: 'Payment Verified',
      timestamp: new Date().toISOString(),
      updatedBy: 'Admin'
    });
    
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'Payment Verified',
        status_history: statusHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error verifying payment:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to verify payment' 
      });
    }
    
    console.log(`✅ Payment verified for order ${orderId}`);
    
    res.json({
      success: true,
      message: 'Payment verified successfully!',
      order: formatOrder(updatedOrder)
    });
    
  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while verifying payment' 
    });
  }
});

// Helper function for order timeline
function getOrderTimeline(order) {
  const timeline = [];
  
  timeline.push({
    status: 'Order Placed',
    description: 'Order has been placed successfully',
    timestamp: order.created_at,
    completed: true,
    icon: '🛒'
  });
  
  if (order.payment_method === 'online') {
    const paymentVerified = order.status === 'Payment Verified' || 
                           order.status === 'Confirmed' || 
                           order.status === 'Shipped' || 
                           order.status === 'Delivered';
    
    const isPending = order.status === 'Payment Verification Pending';
    
    timeline.push({
      status: 'Payment Verification',
      description: isPending 
        ? 'Payment verification pending. Please complete payment.' 
        : paymentVerified 
          ? 'Payment verified successfully!' 
          : 'Payment verification in progress',
      timestamp: paymentVerified ? new Date().toISOString() : null,
      completed: paymentVerified,
      icon: '💳'
    });
  }
  
  const statusMap = {
    'Confirmed': { icon: '✅', description: 'Your order has been confirmed by the seller' },
    'Shipped': { icon: '🚚', description: 'Your order has been shipped and is on the way' },
    'Delivered': { icon: '📦', description: 'Your order has been delivered successfully' }
  };
  
  const statuses = ['Confirmed', 'Shipped', 'Delivered'];
  let isCompleted = true;
  const createdDate = new Date(order.created_at);
  
  for (const status of statuses) {
    const isStatusCompleted = order.status === status || 
      (status === 'Confirmed' && ['Shipped', 'Delivered'].includes(order.status)) ||
      (status === 'Shipped' && ['Delivered'].includes(order.status));
    
    if (!isStatusCompleted && isCompleted) {
      isCompleted = false;
    }
    
    let timestamp = null;
    if (order.status_history) {
      const history = order.status_history.find(h => h.status === status);
      if (history) {
        timestamp = history.timestamp;
      }
    }
    
    if (isStatusCompleted && !timestamp) {
      const baseTime = new Date(createdDate.getTime());
      if (status === 'Confirmed') baseTime.setHours(baseTime.getHours() + 1);
      else if (status === 'Shipped') baseTime.setHours(baseTime.getHours() + 24);
      else if (status === 'Delivered') baseTime.setHours(baseTime.getHours() + 48);
      timestamp = baseTime.toISOString();
    }
    
    timeline.push({
      status: status,
      description: statusMap[status].description,
      timestamp: timestamp,
      completed: isStatusCompleted && isCompleted,
      icon: statusMap[status].icon
    });
  }
  
  if (order.status === 'Cancelled') {
    const cancelHistory = order.status_history?.find(h => h.status === 'Cancelled');
    timeline.push({
      status: 'Cancelled',
      description: 'Order has been cancelled',
      timestamp: cancelHistory?.timestamp || new Date().toISOString(),
      completed: true,
      icon: '❌'
    });
  }
  
  return timeline;
}

// Update order status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    const userId = decoded.userId;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role, name')
      .eq('id', userId)
      .single();
    
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('id', userId)
      .single();
    
    const isAdmin = (user && user.role === 'admin') || admin;
    
    if (!isAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }
    
    const adminName = user?.name || 'Admin';
    
    const validStatuses = ['Pending', 'Payment Verification Pending', 'Payment Verified', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, status_history')
      .eq('id', orderId)
      .single();
    
    if (fetchError || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const statusHistory = order.status_history || [];
    statusHistory.push({
      status: status,
      timestamp: new Date().toISOString(),
      updatedBy: adminName
    });
    
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: status,
        status_history: statusHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating order status:', updateError);
      return res.status(500).json({ success: false, message: 'Error updating order status' });
    }
    
    const timeline = getOrderTimeline(updatedOrder);
    
    res.json({ 
      success: true, 
      message: 'Order status updated successfully',
      order: formatOrder(updatedOrder),
      tracking: { timeline }
    });
    
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Error updating order status' });
  }
});

// User cancel order
app.patch('/api/orders/:id/cancel', async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    
    const userId = decoded.userId;
    
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();
    
    if (fetchError || !order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('id', userId)
      .single();
    
    const isAdmin = !adminError && admin;
    const isOwner = order.user_id === userId;
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not authorized to cancel this order' 
      });
    }
    
    const cancellableStatuses = ['Pending', 'Payment Verification Pending', 'Confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Order cannot be cancelled. Current status: ${order.status}` 
      });
    }
    
    const statusHistory = order.status_history || [];
    statusHistory.push({
      status: 'Cancelled',
      timestamp: new Date().toISOString(),
      updatedBy: isAdmin ? 'Admin' : 'User'
    });
    
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'Cancelled',
        status_history: statusHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error cancelling order:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to cancel order' 
      });
    }
    
    console.log(`✅ Order ${orderId} cancelled by ${isAdmin ? 'Admin' : 'User'}`);
    
    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: formatOrder(updatedOrder)
    });
    
  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while cancelling order' 
    });
  }
});

// Admin orders
app.get('/api/admin/orders', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    const userId = decoded.userId;
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('id', userId)
      .single();
    
    const isAdmin = (user && user.role === 'admin') || admin;
    
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const { status, search, page = 1, limit = 10 } = req.query;
    
    let query = supabase.from('orders').select('*', { count: 'exact' });
    
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    
    if (search) {
      query = query.or(`user_name.ilike.%${search}%,user_email.ilike.%${search}%,delivery->>phone.ilike.%${search}%`);
    }
    
    const skip = (page - 1) * limit;
    const { data: orders, error, count } = await query
      .order('created_at', { ascending: false })
      .range(skip, skip + parseInt(limit) - 1);
    
    if (error) {
      console.error('Error fetching admin orders:', error);
      return res.status(500).json({ success: false, message: 'Error fetching orders' });
    }
    
    const { data: statusCounts, error: countError } = await supabase
      .from('orders')
      .select('status', { count: 'exact', head: false });
    
    const counts = {
      all: 0,
      Pending: 0,
      'Payment Verification Pending': 0,
      'Payment Verified': 0,
      Confirmed: 0,
      Shipped: 0,
      Delivered: 0,
      Cancelled: 0
    };
    
    if (!countError && statusCounts) {
      counts.all = statusCounts.length;
      statusCounts.forEach(item => {
        if (counts.hasOwnProperty(item.status)) {
          counts[item.status] = (counts[item.status] || 0) + 1;
        }
      });
    }
    
    res.json({
      success: true,
      orders: orders.map(formatOrder),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || orders.length,
        pages: Math.ceil((count || orders.length) / limit)
      },
      counts
    });
    
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ success: false, message: 'Error fetching orders' });
  }
});

// =============================================
// HEALTH CHECK
// =============================================
app.get('/health', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .limit(1);
    
    res.json({
      status: 'OK',
      message: 'Backend is running with Supabase',
      timestamp: new Date().toISOString(),
      supabase: error ? 'Connected but error' : 'Connected',
      database: 'Supabase PostgreSQL',
      email: 'Resend API with Verified Domain',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.json({
      status: 'OK',
      message: 'Backend is running',
      timestamp: new Date().toISOString(),
      supabase: 'Connection failed',
      database: 'Supabase PostgreSQL',
      email: 'Resend API with Verified Domain',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'AteliMarket API',
    version: '4.0.0',
    status: 'Running with Supabase + Resend (Verified Domain)',
    database: 'Supabase PostgreSQL',
    features: {
      registration: '✅ OTP verification',
      'mobile number': '✅ Required',
      'confirm password': '✅ Required',
      login: '✅ JWT + bcrypt',
      products: '✅ CRUD operations',
      cart: '✅ User cart management',
      orders: '✅ Order management',
      'forgot-password': '✅ Email check first'
    },
    endpoints: {
      health: '/health',
      products: '/api/products',
      auth: '/api/auth/register (with OTP)',
      'verify-registration': '/api/auth/verify-registration',
      'resend-registration-otp': '/api/auth/resend-registration-otp',
      login: '/api/auth/login',
      'forgot-password': '/api/auth/forgot-password',
      'verify-otp': '/api/auth/verify-otp',
      'reset-password': '/api/auth/reset-password',
      cart: '/api/cart',
      orders: '/api/orders',
      tracking: '/api/orders/:id/tracking',
      verifyPayment: '/api/orders/:id/verify-payment',
      cancel: '/api/orders/:id/cancel',
      adminOrders: '/api/admin/orders'
    },
    note: 'Resend API used for emails - Domain verified: atelimarket.shop'
  });
});

// =============================================
// ERROR HANDLING
// =============================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.url} not found` });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'Internal server error' 
  });
});

// =============================================
// START SERVER
// =============================================
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`✅ Image URL mode: Enabled`);
  console.log(`🛒 Cart saved in Supabase PostgreSQL`);
  console.log(`🔑 JWT Secret: ${jwtSecret ? '✅ Set' : '❌ Not Set'}`);
  console.log(`☁️  Supabase: ${supabaseUrl ? '✅ Connected' : '❌ Not Set'}`);
  console.log(`📊 Database: Supabase PostgreSQL`);
  console.log(`📧 Email service: ${resendApiKey ? '✅ Resend API' : '❌ Not Configured'}`);
  console.log(`📧 From Email: ${emailFrom} ✅ Verified Domain`);
  console.log(`⚡ Registration: OTP + Mobile + Confirm Password`);
  console.log(`⚡ Password Reset: OTP + Reset Token (Case Insensitive)`);
  console.log(`⚡ Forgot Password: ✅ Email check first`);
  console.log(`⚡ OTP: 10 minutes expiry`);
});
