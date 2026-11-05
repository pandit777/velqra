const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Order } = require('../models/Order');
const { Cart } = require('../models/Cart');
const { User } = require('../models/User');

const jwtSecret = process.env.JWT_SECRET || 'atelimarket_super_secret_key_2026';

// Middleware to get user ID from token
const getUserId = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, jwtSecret);
    return decoded.userId;
  } catch (err) {
    return null;
  }
};

// =============================================
// CREATE ORDER
// =============================================
router.post('/', async (req, res) => {
  try {
    console.log('📦 Creating order...');
    const { items, total, paymentMethod, referenceId, delivery } = req.body;

    // Validation
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

    // Get user info if logged in
    let userId = null;
    let userName = 'Guest';
    let userEmail = '';

    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, jwtSecret);
        userId = decoded.userId;
        
        const user = await User.findById(userId);
        if (user) {
          userName = user.name || 'Guest';
          userEmail = user.email || '';
        }
      } catch (err) {
        console.log('⚠️ Token verification failed, proceeding as guest');
      }
    }

    // Create order
    const orderItems = items.map(item => ({
      product_id: item._id || item.productId || null,
      name: String(item.name || 'Product'),
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
      image: String(item.image || item.imageUrl || '')
    }));

    const orderData = {
      userId,
      userName,
      userEmail,
      items: orderItems,
      total: Number(total),
      paymentMethod: paymentMethod || 'cod',
      referenceId: referenceId || null,
      delivery: {
        fullName: String(delivery.fullName || '').trim(),
        phone: String(delivery.phone || '').trim(),
        email: String(delivery.email || '').trim(),
        address: String(delivery.address || '').trim(),
        landmark: String(delivery.landmark || '').trim(),
        city: String(delivery.city || '').trim(),
        state: String(delivery.state || '').trim(),
        pincode: String(delivery.pincode || '').trim(),
        note: String(delivery.note || '').trim()
      },
      status: 'Pending',
      statusHistory: [{
        status: 'Pending',
        timestamp: new Date().toISOString(),
        updatedBy: 'System'
      }]
    };

    const order = await Order.create(orderData);

    // Clear cart after order
    if (userId) {
      try {
        await Cart.clear(userId);
        console.log('🗑️ Cart cleared after order');
      } catch (err) {
        console.log('⚠️ Could not clear cart:', err.message);
      }
    }

    console.log(`✅ Order placed successfully! ID: ${order.id}`);
    
    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      order: {
        _id: order.id,
        id: order.id,
        userId: order.user_id,
        userName: order.user_name,
        userEmail: order.user_email,
        items: order.items,
        total: order.total,
        paymentMethod: order.payment_method,
        referenceId: order.reference_id,
        delivery: order.delivery,
        status: order.status,
        statusHistory: order.status_history,
        createdAt: order.created_at,
        updatedAt: order.updated_at
      }
    });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to place order'
    });
  }
});

// =============================================
// GET USER ORDERS
// =============================================
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Please login to view orders' 
      });
    }

    const orders = await Order.findByUserId(userId);
    
    const formattedOrders = orders.map(order => ({
      _id: order.id,
      id: order.id,
      userId: order.user_id,
      userName: order.user_name,
      userEmail: order.user_email,
      items: order.items,
      total: order.total,
      paymentMethod: order.payment_method,
      referenceId: order.reference_id,
      delivery: order.delivery,
      status: order.status,
      statusHistory: order.status_history,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }));

    res.json({ 
      success: true, 
      orders: formattedOrders 
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching orders' 
    });
  }
});

// =============================================
// GET ORDER TRACKING
// =============================================
router.get('/:id/tracking', async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Check authorization
    const userId = getUserId(req);
    let isAuthorized = false;

    if (userId) {
      const user = await User.findById(userId);
      if (user && (user.role === 'admin' || order.user_id === userId)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized to view this order' 
      });
    }

    const timeline = Order.getTimeline(order);

    res.json({
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
  } catch (error) {
    console.error('Error fetching tracking:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching tracking details' 
    });
  }
});

// =============================================
// UPDATE ORDER STATUS (Admin only)
// =============================================
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    // Check admin authorization
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const validStatuses = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid status' 
      });
    }

    const order = await Order.updateStatus(orderId, status, user.name || 'Admin');
    const timeline = Order.getTimeline(order);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: {
        _id: order.id,
        id: order.id,
        status: order.status,
        statusHistory: order.status_history,
        updatedAt: order.updated_at
      },
      tracking: { timeline }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating order status' 
    });
  }
});

module.exports = router;
