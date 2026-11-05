const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');

const jwtSecret = process.env.JWT_SECRET || 'atelimarket_super_secret_key_2026';

// Middleware to get user ID from token
const getUserId = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    throw new Error('No token provided');
  }
  const decoded = jwt.verify(token, jwtSecret);
  return decoded.userId;
};

// =============================================
// GET CART
// =============================================
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const cart = await Cart.getOrCreate(userId);
    
    res.json({
      success: true,
      cart: {
        items: cart.items || [],
        totalItems: cart.total_items || 0,
        totalPrice: cart.total_price || 0,
        totalSavings: cart.total_savings || 0,
        updatedAt: cart.updated_at || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(401).json({ 
      success: false, 
      message: error.message || 'Please login to view cart' 
    });
  }
});

// =============================================
// ADD TO CART
// =============================================
router.post('/add', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { productId, qty = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID is required' 
      });
    }

    // Check product stock
    const product = await Product.findById(productId);
    if (!product) {
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

    const cart = await Cart.addItem(userId, productId, qty);
    
    res.json({
      success: true,
      message: 'Product added to cart',
      cart: {
        items: cart.items || [],
        totalItems: cart.total_items || 0,
        totalPrice: cart.total_price || 0,
        totalSavings: cart.total_savings || 0
      }
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

// =============================================
// UPDATE CART ITEM QUANTITY
// =============================================
router.put('/update/:productId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { productId } = req.params;
    const { qty } = req.body;

    if (!qty || qty < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid quantity is required' 
      });
    }

    const cart = await Cart.updateItemQuantity(userId, productId, qty);
    
    res.json({
      success: true,
      message: 'Cart updated',
      cart: {
        items: cart.items || [],
        totalItems: cart.total_items || 0,
        totalPrice: cart.total_price || 0,
        totalSavings: cart.total_savings || 0
      }
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

// =============================================
// REMOVE FROM CART
// =============================================
router.delete('/remove/:productId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { productId } = req.params;

    const cart = await Cart.removeItem(userId, productId);
    
    res.json({
      success: true,
      message: 'Item removed from cart',
      cart: {
        items: cart.items || [],
        totalItems: cart.total_items || 0,
        totalPrice: cart.total_price || 0,
        totalSavings: cart.total_savings || 0
      }
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

// =============================================
// CLEAR CART
// =============================================
router.delete('/clear', async (req, res) => {
  try {
    const userId = getUserId(req);
    await Cart.clear(userId);
    
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

// =============================================
// SYNC LOCAL CART
// =============================================
router.post('/sync', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid cart items' 
      });
    }

    // Process items and add to cart
    const processedItems = [];
    for (const item of items) {
      const product = await Product.findById(item._id);
      if (!product) continue;

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
        category: product.category
      });
    }

    const cart = await Cart.updateCart(userId, processedItems);
    
    res.json({
      success: true,
      message: 'Cart synced successfully',
      cart: {
        items: cart.items || [],
        totalItems: cart.total_items || 0,
        totalPrice: cart.total_price || 0,
        totalSavings: cart.total_savings || 0
      }
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

module.exports = router;
