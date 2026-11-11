require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Supabase credentials are missing.');
  process.exit(1);
}
if (adminEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) ||
    adminPassword.length < 12 || Buffer.byteLength(adminPassword, 'utf8') > 72) {
  console.error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of 12-72 bytes in the backend environment.');
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
    .eq('email', adminEmail)
    .maybeSingle();

  if (lookupError) throw lookupError;

  const result = existing
    ? await supabase.from('admins').update({ password: hashedPassword }).eq('id', existing.id)
    : await supabase.from('admins').insert({ email: adminEmail, password: hashedPassword });

  if (result.error) throw result.error;
  console.log(existing ? 'Admin password updated.' : 'Admin account created.');
}

createAdmin().catch(error => {
  console.error('Admin provisioning failed:', error.code || 'database error');
  process.exitCode = 1;
});
