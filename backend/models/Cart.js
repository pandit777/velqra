/**
 * Cart Model - Supabase Version
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const Cart = {
  /**
   * यूज़र का कार्ट ढूंढें या बनाएं
   */
  async getOrCreate(userId) {
    let { data: cart, error } = await supabase
      .from('carts')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Cart doesn't exist, create one
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
        console.error('❌ Error creating cart:', createError);
        throw createError;
      }
      cart = newCart;
    } else if (error) {
      console.error('❌ Error fetching cart:', error);
      throw error;
    }

    return cart;
  },

  /**
   * कार्ट में आइटम जोड़ें
   */
  async addItem(userId, productId, quantity = 1) {
    const cart = await this.getOrCreate(userId);
    let items = cart.items || [];

    const existingIndex = items.findIndex(item => 
      item.product_id === productId
    );

    if (existingIndex > -1) {
      items[existingIndex].qty += quantity;
    } else {
      // Get product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        throw new Error('Product not found');
      }

      items.push({
        product_id: product.id,
        name: product.name,
        price: product.price,
        original_price: product.original_price,
        discount_percent: product.discount_percent || 0,
        qty: quantity,
        image: product.image || '',
        image_url: product.image_url || '',
        stock: product.stock,
        category: product.category
      });
    }

    return await this.updateCart(userId, items);
  },

  /**
   * कार्ट अपडेट करें
   */
  async updateCart(userId, items) {
    const totalItems = items.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalSavings = items.reduce((sum, item) => {
      return sum + ((item.original_price - item.price) * item.qty);
    }, 0);

    const { data: cart, error } = await supabase
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

    if (error) {
      console.error('❌ Error updating cart:', error);
      throw error;
    }

    return cart;
  },

  /**
   * कार्ट से आइटम हटाएं
   */
  async removeItem(userId, productId) {
    const cart = await this.getOrCreate(userId);
    let items = cart.items || [];
    items = items.filter(item => item.product_id !== productId);
    return await this.updateCart(userId, items);
  },

  /**
   * कार्ट आइटम की क्वांटिटी अपडेट करें
   */
  async updateItemQuantity(userId, productId, quantity) {
    const cart = await this.getOrCreate(userId);
    let items = cart.items || [];

    const itemIndex = items.findIndex(item => 
      item.product_id === productId
    );

    if (itemIndex === -1) {
      throw new Error('Item not found in cart');
    }

    if (quantity === 0) {
      items.splice(itemIndex, 1);
    } else {
      items[itemIndex].qty = quantity;
    }

    return await this.updateCart(userId, items);
  },

  /**
   * कार्ट खाली करें
   */
  async clear(userId) {
    return await this.updateCart(userId, []);
  }
};

// Backward Compatibility
class CartModel {
  static async findOne(query) {
    if (query.userId) {
      return await Cart.getOrCreate(query.userId);
    }
    return null;
  }

  static async create(data) {
    return await Cart.getOrCreate(data.userId);
  }

  static async findByIdAndUpdate(userId, updates) {
    if (updates.items !== undefined) {
      return await Cart.updateCart(userId, updates.items);
    }
    return null;
  }
}

module.exports = {
  Cart,
  CartModel,
  default: CartModel
};
