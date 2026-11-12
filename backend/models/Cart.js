/**
 * Cart Model - Supabase Version
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const normalizeAttributes = attributes => {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return {};
  return Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)));
};

const getItemKey = item => JSON.stringify([
  String(item.product_id || item.productId || item._id || item.id || ''),
  normalizeAttributes(item.selected_attributes || item.selectedAttributes),
  String(item.promo_code || item.promoCode || '').trim().toUpperCase()
]);

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
  buildItem(product, quantity, selectedAttributes = {}, promoCode = '') {
    const qty = Number(quantity);
    if (!Number.isSafeInteger(qty) || qty < 1) {
      throw new Error('A valid quantity is required');
    }
    const stock = Number(product.stock);
    if (!Number.isSafeInteger(stock) || stock < 1) {
      throw new Error('Product is out of stock');
    }

    const attributes = normalizeAttributes(selectedAttributes);
    const availableAttributes = product.attributes && typeof product.attributes === 'object'
      ? product.attributes
      : {};
    for (const [key, values] of Object.entries(availableAttributes)) {
      if (Array.isArray(values) && values.length > 0 && !values.includes(attributes[key])) {
        throw new Error(`Select a valid ${key} option`);
      }
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (!Array.isArray(availableAttributes[key]) || !availableAttributes[key].includes(value)) {
        throw new Error(`Invalid ${key} option`);
      }
    }

    const normalizedPromoCode = String(promoCode || '').trim().toUpperCase();
    const catalogPromoCode = String(product.promo_code || '').trim().toUpperCase();
    const promoDiscount = Number(product.promo_discount) || 0;
    if (normalizedPromoCode && (normalizedPromoCode !== catalogPromoCode || promoDiscount <= 0)) {
      throw new Error('This promotion is no longer valid');
    }

    const originalPrice = Number(product.original_price) || Number(product.price) || 0;
    const basePrice = Number(product.price) || 0;
    const price = normalizedPromoCode
      ? Math.round(basePrice * (1 - promoDiscount / 100))
      : basePrice;

    return {
      product_id: product.id,
      name: product.name,
      price,
      original_price: originalPrice,
      discount_percent: Number(product.discount_percent) || 0,
      qty,
      image: product.image || '',
      image_url: product.image_url || '',
      stock,
      category: product.category || '',
      selected_attributes: attributes,
      promo_code: normalizedPromoCode,
      promo_applied: Boolean(normalizedPromoCode)
    };
  },

  async addItem(userId, productId, quantity = 1, selectedAttributes = {}, promoCode = '') {
    const cart = await this.getOrCreate(userId);
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) throw new Error('Product not found');

    const items = cart.items || [];
    const newItem = this.buildItem(product, quantity, selectedAttributes, promoCode);
    const existingIndex = items.findIndex(item => getItemKey(item) === getItemKey(newItem));
    const currentQuantity = existingIndex >= 0 ? Number(items[existingIndex].qty) || 0 : 0;
    const productQuantity = items
      .filter(item => String(item.product_id || item.productId || item._id || item.id) === String(productId))
      .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    if (productQuantity + Number(quantity) > Number(product.stock)) {
      throw new Error('Not enough stock');
    }

    if (existingIndex >= 0) {
      items[existingIndex] = { ...newItem, qty: currentQuantity + Number(quantity) };
    } else {
      items.push(newItem);
    }

    return this.updateCart(userId, items);
  },

  /**
   * कार्ट अपडेट करें
   */
  async updateCart(userId, items) {
    const mergedItems = new Map();
    for (const item of items) {
      const key = getItemKey(item);
      const existing = mergedItems.get(key);
      mergedItems.set(key, existing
        ? { ...existing, qty: (Number(existing.qty) || 0) + (Number(item.qty) || 0) }
        : item);
    }
    const normalizedItems = [...mergedItems.values()];
    const totalItems = normalizedItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    const totalPrice = normalizedItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const totalSavings = normalizedItems.reduce((sum, item) => {
      return sum + (((Number(item.original_price) || 0) - (Number(item.price) || 0)) * (Number(item.qty) || 0));
    }, 0);

    const { data: cart, error } = await supabase
      .from('carts')
      .update({
        items: normalizedItems,
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
  async removeItem(userId, productId, selectedAttributes, promoCode) {
    const cart = await this.getOrCreate(userId);
    const targetKey = getItemKey({
      product_id: productId,
      selected_attributes: selectedAttributes || {},
      promo_code: promoCode || ''
    });
    const items = (cart.items || []).filter(item =>
      selectedAttributes === undefined && promoCode === undefined
        ? String(item.product_id || item.productId || item._id || item.id) !== String(productId)
        : getItemKey(item) !== targetKey
    );
    return await this.updateCart(userId, items);
  },

  /**
   * कार्ट आइटम की क्वांटिटी अपडेट करें
   */
  async updateItemQuantity(userId, productId, quantity, selectedAttributes = {}, promoCode = '') {
    const cart = await this.getOrCreate(userId);
    const items = cart.items || [];
    const targetKey = getItemKey({
      product_id: productId,
      selected_attributes: selectedAttributes,
      promo_code: promoCode
    });
    const itemIndex = items.findIndex(item => getItemKey(item) === targetKey);

    if (itemIndex === -1) {
      throw new Error('Item not found in cart');
    }

    if (quantity === 0) {
      items.splice(itemIndex, 1);
    } else {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (error) throw error;
      if (!product) throw new Error('Product not found');

      const otherQuantity = items
        .filter((item, index) => index !== itemIndex &&
          String(item.product_id || item.productId || item._id || item.id) === String(productId))
        .reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      if (Number(quantity) > (Number(items[itemIndex].qty) || 0) &&
        otherQuantity + Number(quantity) > Number(product.stock)) {
        throw new Error('Not enough stock');
      }
      items[itemIndex] = this.buildItem(product, quantity, selectedAttributes, promoCode);
    }

    return this.updateCart(userId, items);
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
