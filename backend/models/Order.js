/**
 * Order Model - Supabase Version
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseSecretKey);

const Order = {
  /**
   * नया ऑर्डर बनाएं
   */
  async create(orderData) {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        user_id: orderData.userId || null,
        user_name: orderData.userName || 'Guest',
        user_email: orderData.userEmail || '',
        items: orderData.items || [],
        total: orderData.total,
        payment_method: orderData.paymentMethod || 'cod',
        reference_id: orderData.referenceId || null,
        delivery: orderData.delivery || {},
        status: orderData.status || 'Pending',
        status_history: orderData.statusHistory || [{
          status: 'Pending',
          timestamp: new Date().toISOString(),
          updatedBy: 'System'
        }]
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error (Order):', error);
      throw error;
    }

    return data;
  },

  /**
   * ID से ऑर्डर ढूंढें
   */
  async findById(id) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }

    if (error) {
      console.error('❌ Supabase query error (Order):', error);
      throw error;
    }

    return data;
  },

  /**
   * यूज़र के सभी ऑर्डर्स
   */
  async findByUserId(userId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase query error (Order):', error);
      throw error;
    }

    return data || [];
  },

  /**
   * सभी ऑर्डर्स (Admin)
   */
  async findAll(filters = {}) {
    let query = supabase.from('orders').select('*', { count: 'exact' });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.search) {
      query = query.or(`user_name.ilike.%${filters.search}%,user_email.ilike.%${filters.search}%,delivery->>phone.ilike.%${filters.search}%`);
    }

    if (filters.limit) {
      const skip = (filters.page - 1) * filters.limit;
      query = query
        .order('created_at', { ascending: false })
        .range(skip, skip + filters.limit - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Supabase query error (Order):', error);
      throw error;
    }

    return { data: data || [], count: count || 0 };
  },

  /**
   * ऑर्डर स्टेटस अपडेट करें
   */
  async updateStatus(orderId, status, updatedBy = 'Admin') {
    // Get current order
    const order = await this.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const statusHistory = order.status_history || [];
    statusHistory.push({
      status: status,
      timestamp: new Date().toISOString(),
      updatedBy: updatedBy
    });

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: status,
        status_history: statusHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase update error (Order):', error);
      throw error;
    }

    return data;
  },

  /**
   * ऑर्डर ट्रैकिंग टाइमलाइन
   */
  getTimeline(order) {
    const timeline = [];
    
    timeline.push({
      status: 'Order Placed',
      description: 'Order has been placed successfully',
      timestamp: order.created_at,
      completed: true,
      icon: '🛒'
    });

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

    return timeline;
  },

  /**
   * स्टेटस के अनुसार काउंट
   */
  async getStatusCounts() {
    const { data, error } = await supabase
      .from('orders')
      .select('status', { count: 'exact', head: false });

    if (error) {
      console.error('❌ Supabase query error (Order):', error);
      throw error;
    }

    const counts = {
      all: 0,
      Pending: 0,
      Confirmed: 0,
      Shipped: 0,
      Delivered: 0,
      Cancelled: 0
    };

    if (data) {
      counts.all = data.length;
      data.forEach(item => {
        if (counts.hasOwnProperty(item.status)) {
          counts[item.status] = (counts[item.status] || 0) + 1;
        }
      });
    }

    return counts;
  }
};

// Backward Compatibility
class OrderModel {
  constructor(data) {
    this._data = data;
  }

  static async findOne(query) {
    if (query._id) {
      return await Order.findById(query._id);
    }
    if (query.userId) {
      return await Order.findByUserId(query.userId);
    }
    return null;
  }

  static async findById(id) {
    return await Order.findById(id);
  }

  static async create(data) {
    return await Order.create(data);
  }

  static async find(query = {}) {
    const result = await Order.findAll(query);
    return result.data || [];
  }

  static async findByIdAndUpdate(id, updates) {
    if (updates.status) {
      return await Order.updateStatus(id, updates.status, updates.updatedBy);
    }
    return null;
  }

  save() {
    if (this._data._id) {
      return Order.updateStatus(this._data._id, this._data.status);
    }
    return Order.create(this._data);
  }
}

module.exports = {
  Order,
  OrderModel,
  default: OrderModel
};
