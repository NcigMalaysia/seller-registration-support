// Run locally by the project owner only. Never run this from the public website.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [command, usernameInput, displayName, role = 'seller'] = process.argv.slice(2);
const username = usernameInput?.trim().toLowerCase();
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret || !['create', 'reset'].includes(command) || !/^[a-z0-9_]{3,32}$/.test(username || '')) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/manage-user.mjs create <username> <display_name> [seller|admin]');
  console.error('   or: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/manage-user.mjs reset <username>');
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const password = randomBytes(24).toString('base64url');
const email = `${username}@seller.example.com`;

if (command === 'create') {
  if (!displayName?.trim() || !['seller', 'admin'].includes(role)) throw new Error('Display name and valid role are required.');
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const { error: profileError } = await db.from('profiles').upsert({ id: data.user.id, username, display_name: displayName.trim(), email, role, approved_at: new Date().toISOString() });
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id);
    throw profileError;
  }
} else {
  const { data, error } = await db.from('profiles').select('id').eq('username', username).single();
  if (error) throw error;
  const { error: resetError } = await db.auth.admin.updateUserById(data.id, { password });
  if (resetError) throw resetError;
}
console.log(`Username: ${username}\nTemporary password: ${password}\nRole: ${command === 'create' ? role : 'unchanged'}`);
console.log('Share the password privately and ask the user to change it via the project owner. Do not commit or save this output.');
