const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Order } = require('../models/Order');
const { User } = require('../models/User');
const { Product } = require('../models/Product');

const jwtSecret = process.env.JWT_SECRET || 'atelimarket_super_secret_key_2026';

// Middleware to check admin access
const checkAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// =============================================
// GET ALL ORDERS (Admin)
// =============================================
router.get('/orders', checkAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    
    const result = await Order.findAll({
      status,
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    const counts = await Order.getStatusCounts();

    const formattedOrders = result.data.map(order => ({
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
      orders: formattedOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.count,
        pages: Math.ceil(result.count / limit)
      },
      counts
    });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching orders' 
    });
  }
});

// =============================================
// GET DASHBOARD STATS (Admin)
// =============================================
router.get('/stats', checkAdmin, async (req, res) => {
  try {
    // Get order counts
    const orderCounts = await Order.getStatusCounts();
    
    // Get product count
    const products = await Product.findAll();
    const productCount = products.length;
    
    // Get user count
    const users = await User.findAll();
    const userCount = users.length;

    // Calculate total revenue
    const allOrders = await Order.findAll({});
    const totalRevenue = allOrders.data.reduce((sum, order) => {
      return order.status !== 'Cancelled' ? sum + (order.total || 0) : sum;
    }, 0);

    res.json({
      success: true,
      stats: {
        totalOrders: orderCounts.all,
        pendingOrders: orderCounts.Pending,
        confirmedOrders: orderCounts.Confirmed,
        shippedOrders: orderCounts.Shipped,
        deliveredOrders: orderCounts.Delivered,
        cancelledOrders: orderCounts.Cancelled,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalProducts: productCount,
        totalUsers: userCount
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching stats' 
    });
  }
});

module.exports = router;
