/**
 * Supabase Seed Script
 * 
 * यह script Supabase में products टेबल में डेटा डालेगा
 * 
 * Run: node seed.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// =============================================
// SUPABASE CONNECTION
// =============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Supabase credentials are missing!');
  console.error('Please set SUPABASE_URL and SUPABASE_SECRET_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);
console.log('✅ Supabase client initialized');

// =============================================
// SEED DATA
// =============================================
const seedProducts = [
  {
    name: 'Men Casual Shirt',
    price: 799,
    original_price: 1299,
    discount_percent: 38,
    category: 'Mens',
    icon: '👔',
    stock: 20,
    description: 'Stylish casual wear for everyday comfort',
    image: 'https://via.placeholder.com/300x300?text=Shirt',
    image_url: 'https://via.placeholder.com/300x300?text=Shirt',
    images: ['https://via.placeholder.com/300x300?text=Shirt'],
    brand: 'FashionHub',
    color: 'Blue',
    size: 'M',
    material: 'Cotton',
    tags: ['casual', 'men', 'shirt'],
    is_active: true
  },
  {
    name: 'Women Summer Dress',
    price: 999,
    original_price: 1599,
    discount_percent: 38,
    category: 'Womens',
    icon: '👗',
    stock: 18,
    description: 'Comfortable and trendy dress for all occasions',
    image: 'https://via.placeholder.com/300x300?text=Dress',
    image_url: 'https://via.placeholder.com/300x300?text=Dress',
    images: ['https://via.placeholder.com/300x300?text=Dress'],
    brand: 'FashionHub',
    color: 'Red',
    size: 'L',
    material: 'Polyester',
    tags: ['dress', 'women', 'summer'],
    is_active: true
  },
  {
    name: 'The Power of Habit',
    price: 299,
    original_price: 499,
    discount_percent: 40,
    category: 'Books',
    icon: '📚',
    stock: 25,
    description: 'Bestselling book on building better routines',
    image: 'https://via.placeholder.com/300x300?text=Book',
    image_url: 'https://via.placeholder.com/300x300?text=Book',
    images: ['https://via.placeholder.com/300x300?text=Book'],
    brand: 'Publisher',
    tags: ['book', 'habit', 'self-help'],
    is_active: true
  },
  {
    name: 'Non-Stick Cookware Set',
    price: 1599,
    original_price: 2499,
    discount_percent: 36,
    category: 'Home & Kitchen',
    icon: '🏠',
    stock: 15,
    description: 'Durable cookware set for your kitchen',
    image: 'https://via.placeholder.com/300x300?text=Cookware',
    image_url: 'https://via.placeholder.com/300x300?text=Cookware',
    images: ['https://via.placeholder.com/300x300?text=Cookware'],
    brand: 'KitchenPro',
    color: 'Silver',
    material: 'Aluminum',
    tags: ['cookware', 'kitchen', 'non-stick'],
    is_active: true
  },
  {
    name: 'Yoga Mat',
    price: 599,
    original_price: 899,
    discount_percent: 33,
    category: 'Sports',
    icon: '🏅',
    stock: 30,
    description: 'Premium quality yoga mat for workouts',
    image: 'https://via.placeholder.com/300x300?text=Yoga+Mat',
    image_url: 'https://via.placeholder.com/300x300?text=Yoga+Mat',
    images: ['https://via.placeholder.com/300x300?text=Yoga+Mat'],
    brand: 'FitLife',
    color: 'Purple',
    material: 'Foam',
    tags: ['yoga', 'fitness', 'workout'],
    is_active: true
  },
  {
    name: 'Vitamin C Tablets',
    price: 199,
    original_price: 299,
    discount_percent: 33,
    category: 'Medicine',
    icon: '💊',
    stock: 40,
    description: 'Daily wellness supplement',
    image: 'https://via.placeholder.com/300x300?text=Vitamin+C',
    image_url: 'https://via.placeholder.com/300x300?text=Vitamin+C',
    images: ['https://via.placeholder.com/300x300?text=Vitamin+C'],
    brand: 'HealthCare',
    tags: ['vitamin', 'health', 'supplement'],
    is_active: true
  },
  {
    name: 'Running Shoes',
    price: 1299,
    original_price: 1899,
    discount_percent: 32,
    category: 'Sports',
    icon: '👟',
    stock: 12,
    description: 'Lightweight running shoes for comfort',
    image: 'https://via.placeholder.com/300x300?text=Shoes',
    image_url: 'https://via.placeholder.com/300x300?text=Shoes',
    images: ['https://via.placeholder.com/300x300?text=Shoes'],
    brand: 'RunFast',
    color: 'Black',
    size: '42',
    material: 'Mesh',
    tags: ['shoes', 'running', 'sports'],
    is_active: true
  },
  {
    name: 'Women Handbag',
    price: 1399,
    original_price: 1999,
    discount_percent: 30,
    category: 'Womens',
    icon: '👜',
    stock: 14,
    description: 'Elegant handbag for daily use',
    image: 'https://via.placeholder.com/300x300?text=Handbag',
    image_url: 'https://via.placeholder.com/300x300?text=Handbag',
    images: ['https://via.placeholder.com/300x300?text=Handbag'],
    brand: 'FashionHub',
    color: 'Brown',
    material: 'Leather',
    tags: ['handbag', 'women', 'accessory'],
    is_active: true
  },
  {
    name: 'Smart Watch',
    price: 2499,
    original_price: 3999,
    discount_percent: 38,
    category: 'Electronics',
    icon: '⌚',
    stock: 10,
    description: 'Feature-rich smart watch with health tracking',
    image: 'https://via.placeholder.com/300x300?text=Watch',
    image_url: 'https://via.placeholder.com/300x300?text=Watch',
    images: ['https://via.placeholder.com/300x300?text=Watch'],
    brand: 'TechGadget',
    color: 'Black',
    tags: ['watch', 'smart', 'electronics'],
    is_active: true
  },
  {
    name: 'Wireless Earbuds',
    price: 1499,
    original_price: 2499,
    discount_percent: 40,
    category: 'Electronics',
    icon: '🎧',
    stock: 25,
    description: 'Premium wireless earbuds with noise cancellation',
    image: 'https://via.placeholder.com/300x300?text=Earbuds',
    image_url: 'https://via.placeholder.com/300x300?text=Earbuds',
    images: ['https://via.placeholder.com/300x300?text=Earbuds'],
    brand: 'TechGadget',
    color: 'White',
    tags: ['earbuds', 'wireless', 'audio'],
    is_active: true
  },
  {
    name: 'Blender Machine',
    price: 899,
    original_price: 1499,
    discount_percent: 40,
    category: 'Home & Kitchen',
    icon: '🥤',
    stock: 8,
    description: 'Powerful blender for smoothies and juices',
    image: 'https://via.placeholder.com/300x300?text=Blender',
    image_url: 'https://via.placeholder.com/300x300?text=Blender',
    images: ['https://via.placeholder.com/300x300?text=Blender'],
    brand: 'KitchenPro',
    color: 'Silver',
    material: 'Plastic',
    tags: ['blender', 'kitchen', 'appliance'],
    is_active: true
  },
  {
    name: 'Desk Lamp',
    price: 499,
    original_price: 799,
    discount_percent: 38,
    category: 'Home & Kitchen',
    icon: '💡',
    stock: 20,
    description: 'LED desk lamp with adjustable brightness',
    image: 'https://via.placeholder.com/300x300?text=Lamp',
    image_url: 'https://via.placeholder.com/300x300?text=Lamp',
    images: ['https://via.placeholder.com/300x300?text=Lamp'],
    brand: 'HomeDecor',
    color: 'White',
    material: 'Metal',
    tags: ['lamp', 'desk', 'lighting'],
    is_active: true
  }
];

// =============================================
// CATEGORIES TO CLEAR (Optional)
// =============================================
const categoriesToClear = [
  'Mens', 
  'Womens', 
  'Books', 
  'Home & Kitchen', 
  'Sports', 
  'Medicine',
  'Electronics'
];

// =============================================
// SEED FUNCTION
// =============================================
async function seedDatabase() {
  try {
    console.log('🌱 Starting seed...');
    
    // =============================================
    // STEP 1: Check if products exist (optional)
    // =============================================
    const { data: existingProducts, error: checkError } = await supabase
      .from('products')
      .select('id, category')
      .in('category', categoriesToClear);

    if (checkError) {
      console.error('❌ Error checking existing products:', checkError);
      throw checkError;
    }

    if (existingProducts && existingProducts.length > 0) {
      console.log(`📋 Found ${existingProducts.length} existing products in categories to clear`);
      
      // Delete existing products
      const productIds = existingProducts.map(p => p.id);
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .in('id', productIds);

      if (deleteError) {
        console.error('❌ Error deleting existing products:', deleteError);
        throw deleteError;
      }
      
      console.log(`🗑️ Deleted ${productIds.length} existing products`);
    }

    // =============================================
    // STEP 2: Insert new products
    // =============================================
    console.log(`📦 Inserting ${seedProducts.length} products...`);
    
    // Insert in batches of 5 (to avoid rate limits)
    const batchSize = 5;
    let insertedCount = 0;
    
    for (let i = 0; i < seedProducts.length; i += batchSize) {
      const batch = seedProducts.slice(i, i + batchSize);
      
      const { data: inserted, error: insertError } = await supabase
        .from('products')
        .insert(batch)
        .select();

      if (insertError) {
        console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, insertError);
        throw insertError;
      }

      insertedCount += inserted.length;
      console.log(`✅ Batch ${i / batchSize + 1}: Inserted ${inserted.length} products`);
    }

    console.log(`✅ Successfully seeded ${insertedCount} products!`);
    
    // =============================================
    // STEP 3: Verify insertion
    // =============================================
    const { data: verifyData, error: verifyError } = await supabase
      .from('products')
      .select('count', { count: 'exact', head: true });

    if (verifyError) {
      console.warn('⚠️ Could not verify product count:', verifyError.message);
    } else {
      console.log(`📊 Total products in database: ${verifyData}`);
    }

    // =============================================
    // STEP 4: Display sample products
    // =============================================
    const { data: sampleProducts, error: sampleError } = await supabase
      .from('products')
      .select('id, name, price, category')
      .limit(5);

    if (!sampleError && sampleProducts) {
      console.log('\n📋 Sample products inserted:');
      sampleProducts.forEach((p, index) => {
        console.log(`  ${index + 1}. ${p.name} - ₹${p.price} (${p.category})`);
      });
    }

    console.log('\n🎉 Seeding completed successfully!');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// =============================================
// RUN SEED
// =============================================
(async () => {
  await seedDatabase();
  process.exit(0);
})();

// =============================================
// EXPORT FOR REUSE (Optional)
// =============================================
module.exports = { seedDatabase, seedProducts };
