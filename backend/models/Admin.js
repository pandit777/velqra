/**
 * Admin Model - Supabase Version
 * 
 * यह फाइल अब MongoDB Schema नहीं है, बल्कि Supabase में 
 * 'admins' टेबल के साथ काम करने के लिए हेल्पर फंक्शन्स प्रदान करती है।
 * 
 * NOTE: Supabase में हमें अलग से Model फाइल्स की ज़रूरत नहीं होती,
 * लेकिन कोड ऑर्गनाइजेशन के लिए हम इसे रख सकते हैं।
 */

// Supabase क्लाइंट इंपोर्ट करें
const { createClient } = require('@supabase/supabase-js');

// Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

// Supabase क्लाइंट इनिशियलाइज़ करें
const supabase = createClient(supabaseUrl, supabaseSecretKey);

/**
 * Admin Model - Supabase के 'admins' टेबल के साथ काम करने के लिए
 * 
 * यह MongoDB Model की जगह एक ऑब्जेक्ट है जिसमें 
 * सभी CRUD ऑपरेशंस के लिए मेथड्स हैं
 */
const Admin = {
  /**
   * नया एडमिन बनाएं
   * @param {Object} adminData - { email, password (hashed) }
   * @returns {Promise<Object>} - बनाया गया एडमिन
   */
  async create(adminData) {
    const { data, error } = await supabase
      .from('admins')
      .insert({
        email: adminData.email,
        password: adminData.password // पहले से ही हैश किया हुआ होना चाहिए
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error (Admin):', error);
      throw error;
    }

    return data;
  },

  /**
   * ईमेल से एडमिन ढूंढें
   * @param {string} email - एडमिन का ईमेल
   * @returns {Promise<Object|null>} - एडमिन ऑब्जेक्ट या null
   */
  async findByEmail(email) {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code === 'PGRST116') {
      // कोई रिकॉर्ड नहीं मिला
      return null;
    }

    if (error) {
      console.error('❌ Supabase query error (Admin):', error);
      throw error;
    }

    return data;
  },

  /**
   * ID से एडमिन ढूंढें
   * @param {string} id - एडमिन का UUID
   * @returns {Promise<Object|null>} - एडमिन ऑब्जेक्ट या null
   */
  async findById(id) {
    const { data, error } = await supabase
      .from('admins')
      .select('id, email, created_at')
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }

    if (error) {
      console.error('❌ Supabase query error (Admin):', error);
      throw error;
    }

    return data;
  },

  /**
   * सभी एडमिन्स की लिस्ट
   * @returns {Promise<Array>} - एडमिन्स की array
   */
  async findAll() {
    const { data, error } = await supabase
      .from('admins')
      .select('id, email, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase query error (Admin):', error);
      throw error;
    }

    return data || [];
  },

  /**
   * एडमिन अपडेट करें
   * @param {string} id - एडमिन का UUID
   * @param {Object} updates - { email, password } (password हैश किया हुआ)
   * @returns {Promise<Object>} - अपडेट किया गया एडमिन
   */
  async update(id, updates) {
    const { data, error } = await supabase
      .from('admins')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase update error (Admin):', error);
      throw error;
    }

    return data;
  },

  /**
   * एडमिन डिलीट करें
   * @param {string} id - एडमिन का UUID
   * @returns {Promise<boolean>} - सफल/असफल
   */
  async delete(id) {
    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Supabase delete error (Admin):', error);
      throw error;
    }

    return true;
  },

  /**
   * एडमिन की पासवर्ड वेरिफिकेशन
   * @param {string} email - एडमिन का ईमेल
   * @param {string} plainPassword - सादा पासवर्ड
   * @param {Function} bcryptCompare - bcrypt.compare फंक्शन
   * @returns {Promise<Object|null>} - एडमिन ऑब्जेक्ट या null
   */
  async verifyPassword(email, plainPassword, bcryptCompare) {
    const admin = await this.findByEmail(email);
    
    if (!admin) {
      return null;
    }

    // स्टोर किए गए हैशेड पासवर्ड से compare करें
    const isValid = await bcryptCompare(plainPassword, admin.password);
    
    if (!isValid) {
      return null;
    }

    // पासवर्ड को हटाकर रिटर्न करें
    const { password, ...adminWithoutPassword } = admin;
    return adminWithoutPassword;
  }
};

// 🔄 Backward Compatibility: MongoDB-style exports
// ताकि पुराना कोड बिना बदलाव के काम करे
class AdminModel {
  constructor(data) {
    this._data = data;
  }

  static async findOne(query) {
    if (query.email) {
      return await Admin.findByEmail(query.email);
    }
    if (query._id) {
      return await Admin.findById(query._id);
    }
    return null;
  }

  static async findById(id) {
    return await Admin.findById(id);
  }

  static async create(data) {
    return await Admin.create(data);
  }

  static async find() {
    return await Admin.findAll();
  }

  static async findByIdAndUpdate(id, updates) {
    return await Admin.update(id, updates);
  }

  static async findByIdAndDelete(id) {
    return await Admin.delete(id);
  }

  save() {
    if (this._data._id) {
      return Admin.update(this._data._id, this._data);
    }
    return Admin.create(this._data);
  }
}

// 📤 Export - दोनों तरीकों से एक्सपोर्ट करें
module.exports = {
  // New Supabase-style exports
  Admin,
  
  // Legacy MongoDB-style exports (backward compatibility)
  AdminModel,
  default: AdminModel
};

// 📝 उपयोग का उदाहरण:
/*
// नए तरीके से उपयोग:
const { Admin } = require('./models/Admin');
const admin = await Admin.findByEmail('admin@example.com');

// पुराने तरीके से उपयोग (backward compatible):
const AdminModel = require('./models/Admin');
const admin = await AdminModel.findOne({ email: 'admin@example.com' });
*/
