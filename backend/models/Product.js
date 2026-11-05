/**
 * Product Model - Supabase Version
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const Product = {
  /**
   * नया प्रोडक्ट बनाएं
   */
  async create(productData) {
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: productData.name,
        price: productData.price,
        original_price: productData.original_price,
        discount_percent: productData.discount_percent || 0,
        category: productData.category,
        stock: productData.stock || 10,
        description: productData.description || '',
        image: productData.image || '',
        image_url: productData.image_url || '',
        images: productData.images || [],
        brand: productData.brand || '',
        weight: productData.weight || null,
        color: productData.color || '',
        size: productData.size || '',
        material: productData.material || '',
        warranty: productData.warranty || '',
        tags: productData.tags || [],
        icon: productData.icon || '📦',
        rating: productData.rating || 0,
        reviews_count: productData.reviews_count || 0,
        popularity: productData.popularity || 0,
        promo_code: productData.promo_code || '',
        promo_discount: productData.promo_discount || 0,
        is_active: productData.is_active !== false
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error (Product):', error);
      throw error;
    }

    return data;
  },

  /**
   * ID से प्रोडक्ट ढूंढें
   */
  async findById(id) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }

    if (error) {
      console.error('❌ Supabase query error (Product):', error);
      throw error;
    }

    return data;
  },

  /**
   * सभी प्रोडक्ट्स (with filters)
   */
  async findAll(filters = {}) {
    let query = supabase.from('products').select('*');

    if (filters.category && filters.category !== 'All') {
      query = query.eq('category', filters.category);
    }

    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,category.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    // Sorting
    if (filters.sort === 'price-low') {
      query = query.order('price', { ascending: true });
    } else if (filters.sort === 'price-high') {
      query = query.order('price', { ascending: false });
    } else if (filters.sort === 'name') {
      query = query.order('name', { ascending: true });
    } else if (filters.sort === 'discount') {
      query = query.order('discount_percent', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Supabase query error (Product):', error);
      throw error;
    }

    return data || [];
  },

  /**
   * प्रोडक्ट अपडेट करें
   */
  async update(id, updates) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase update error (Product):', error);
      throw error;
    }

    return data;
  },

  /**
   * प्रोडक्ट डिलीट करें
   */
  async delete(id) {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Supabase delete error (Product):', error);
      throw error;
    }

    return true;
  },

  /**
   * स्टॉक चेक करें
   */
  async checkStock(productId, quantity) {
    const product = await this.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    return product.stock >= quantity;
  },

  /**
   * स्टॉक अपडेट करें (order के बाद)
   */
  async updateStock(productId, quantity) {
    const product = await this.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    const newStock = product.stock - quantity;
    if (newStock < 0) {
      throw new Error('Insufficient stock');
    }

    return await this.update(productId, { stock: newStock });
  }
};

// Backward Compatibility
class ProductModel {
  constructor(data) {
    this._data = data;
  }

  static async findOne(query) {
    if (query._id) {
      return await Product.findById(query._id);
    }
    return null;
  }

  static async findById(id) {
    return await Product.findById(id);
  }

  static async create(data) {
    return await Product.create(data);
  }

  static async find(query = {}) {
    return await Product.findAll(query);
  }

  static async findByIdAndUpdate(id, updates) {
    return await Product.update(id, updates);
  }

  static async findByIdAndDelete(id) {
    return await Product.delete(id);
  }

  save() {
    if (this._data._id) {
      return Product.update(this._data._id, this._data);
    }
    return Product.create(this._data);
  }
}

module.exports = {
  Product,
  ProductModel,
  default: ProductModel
};
