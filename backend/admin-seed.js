// ✅ पहली line ये होनी चाहिए
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Environment Variables Check
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

// ✅ Check करें कि variables load हुए या नहीं
console.log('🔍 Checking environment variables...');
console.log('SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
console.log('SUPABASE_SECRET_KEY:', supabaseSecretKey ? '✅ Set' : '❌ Missing');

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Supabase credentials are missing!');
  console.error('Please check your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

async function createAdmin() {
  try {
    // ✅ Updated credentials
    const adminEmail = 'gs8901346287@gmail.com';
    const adminPassword = 'Gourav@2005to2026@';  // ← यहाँ नया password डालें

    // Check if admin exists - अगर है तो DELETE करें
    const { data: existing, error: checkError } = await supabase
      .from('admins')
      .select('id')
      .eq('email', adminEmail)
      .single();

    if (existing) {
      console.log('🗑️ Admin already exists, deleting...');
      await supabase.from('admins').delete().eq('email', adminEmail);
      console.log('✅ Admin deleted!');
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const { data: admin, error: createError } = await supabase
      .from('admins')
      .insert({
        email: adminEmail,
        password: hashedPassword
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating admin:', createError);
      throw createError;
    }

    console.log('✅ Admin created successfully!');
    console.log('📧 Email:', adminEmail);
    console.log('🔑 Password:', adminPassword);
    console.log('🆔 ID:', admin.id);
    
  } catch (error) {
    console.error('❌ Failed to create admin:', error.message);
  }
}

createAdmin();
