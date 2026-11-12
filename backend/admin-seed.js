require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || '';

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Supabase credentials are missing.');
  process.exit(1);
}
if (Buffer.byteLength(adminPassword, 'utf8') < 16 || Buffer.byteLength(adminPassword, 'utf8') > 72) {
  console.error('INITIAL_ADMIN_PASSWORD must contain 16-72 bytes.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

async function createAdmin() {
  const hashedPassword = await bcrypt.hash(adminPassword, 12);
  const { data: existing, error: lookupError } = await supabase
    .from('admins')
    .select('id')
    .eq('email', 'admin')
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) {
    console.log('Admin account already exists; its password was not changed.');
    return;
  }

  const result = await supabase.from('admins').insert({ email: 'admin', password: hashedPassword });

  if (result.error) throw result.error;
  console.log('Initial admin account created. Sign in as admin and change the password before opening the storefront.');
}

createAdmin().catch(error => {
  console.error('Admin provisioning failed:', error.code || 'database error');
  process.exitCode = 1;
});
