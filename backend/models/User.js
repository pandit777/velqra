/**
 * User Model - Supabase Version
 * 
 * यह फाइल Supabase में 'users' टेबल के साथ काम करने के लिए है
 */

const { createClient } = require('@supabase/supabase-js');

// Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

// Supabase क्लाइंट इनिशियलाइज़ करें
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const User = {
  /**
   * नया यूज़र बनाएं
   */
  async create(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert({
        name: userData.name,
        email: userData.email,
        password: userData.password, // पहले से हैश किया हुआ
        role: userData.role || 'user'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error (User):', error);
      throw error;
    }

    return data;
  },

  /**
   * ईमेल से यूज़र ढूंढें
   */
  async findByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }

    if (error) {
      console.error('❌ Supabase query error (User):', error);
      throw error;
    }

    return data;
  },

  /**
   * ID से यूज़र ढूंढें
   */
  async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }

    if (error) {
      console.error('❌ Supabase query error (User):', error);
      throw error;
    }

    return data;
  },

  /**
   * सभी यूज़र्स की लिस्ट
   */
  async findAll() {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase query error (User):', error);
      throw error;
    }

    return data || [];
  },

  /**
   * यूज़र अपडेट करें
   */
  async update(id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase update error (User):', error);
      throw error;
    }

    return data;
  },

  /**
   * यूज़र डिलीट करें
   */
  async delete(id) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Supabase delete error (User):', error);
      throw error;
    }

    return true;
  },

  /**
   * पासवर्ड वेरिफिकेशन
   */
  async verifyPassword(email, plainPassword, bcryptCompare) {
    const user = await this.findByEmail(email);
    
    if (!user) {
      return null;
    }

    const isValid = await bcryptCompare(plainPassword, user.password);
    
    if (!isValid) {
      return null;
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
};

// Backward Compatibility: MongoDB-style exports
class UserModel {
  constructor(data) {
    this._data = data;
  }

  static async findOne(query) {
    if (query.email) {
      return await User.findByEmail(query.email);
    }
    if (query._id) {
      return await User.findById(query._id);
    }
    return null;
  }

  static async findById(id) {
    return await User.findById(id);
  }

  static async create(data) {
    return await User.create(data);
  }

  static async find() {
    return await User.findAll();
  }

  static async findByIdAndUpdate(id, updates) {
    return await User.update(id, updates);
  }

  static async findByIdAndDelete(id) {
    return await User.delete(id);
  }

  save() {
    if (this._data._id) {
      return User.update(this._data._id, this._data);
    }
    return User.create(this._data);
  }
}

module.exports = {
  User,
  UserModel,
  default: UserModel
};
