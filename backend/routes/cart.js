const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');

const jwtSecret = process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production' ? '' : 'velqra_local_development_secret');
if (!jwtSecret || (process.env.NODE_ENV === 'production' && Buffer.byteLength(jwtSecret, 'utf8') < 32)) {
  throw new Error('A 32-character JWT_SECRET is required in production');
}

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
    const { productId, selectedAttributes = {}, promoCode = '' } = req.body;
    const qty = Number(req.body.qty ?? 1);

    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID is required' 
      });
    }

    if (!Number.isSafeInteger(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        message: 'A valid quantity is required'
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

    const cart = await Cart.addItem(userId, productId, qty, selectedAttributes, promoCode);
    
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
    const isCartValidationError = /not enough stock|product not found|valid quantity|option|promotion/i.test(error.message || '');
    res.status(isCartValidationError ? 400 : 500).json({
      success: false, 
      message: isCartValidationError ? error.message : 'Error adding to cart',
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
    const { selectedAttributes = {}, promoCode = '' } = req.body;
    const qty = Number(req.body.qty);

    if (!Number.isSafeInteger(qty) || qty < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid quantity is required' 
      });
    }

    const cart = await Cart.updateItemQuantity(userId, productId, qty, selectedAttributes, promoCode);
    
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
    const isCartValidationError = /not enough stock|product not found|item not found|valid quantity|option|promotion/i.test(error.message || '');
    res.status(isCartValidationError ? 400 : 500).json({
      success: false, 
      message: isCartValidationError ? error.message : 'Error updating cart',
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
    const requestedQuantities = new Map();
    for (const item of items) {
      const requestedQty = Number(item.qty);
      if (!Number.isSafeInteger(requestedQty) || requestedQty < 1) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cart quantity'
        });
      }

      const product = await Product.findById(item._id);
      if (!product) continue;

      const alreadyAdded = requestedQuantities.get(String(product.id)) || 0;
      const qty = Math.min(requestedQty, Math.max(0, Number(product.stock) - alreadyAdded));
      if (qty <= 0) continue;

      try {
        processedItems.push(Cart.buildItem(
          product,
          qty,
          item.selectedAttributes || item.selected_attributes || {},
          item.promoCode || item.promo_code || ''
        ));
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      requestedQuantities.set(String(product.id), alreadyAdded + qty);
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
