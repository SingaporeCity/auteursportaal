#!/usr/bin/env node
/**
 * Bootstrap een admin-account in Supabase.
 *
 * Idempotent — als de auth-user of de authors-record al bestaat wordt deze
 * niet opnieuw aangemaakt; alleen de admin-flags worden bijgewerkt.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs                       # admin@noordhoff.nl, recovery flow
 *   node scripts/bootstrap-admin.mjs --email <addr>        # andere email
 *   node scripts/bootstrap-admin.mjs --email <addr> --password <pwd>
 *      (direct password settable; handig voor lokale dev-test)
 *
 * Vereist .env met SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL.
 */

import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env') });

const args = parseArgs(process.argv.slice(2));
const email = args.email ?? 'admin@noordhoff.nl';
const password = args.password ?? null;
const firstName = args.firstName ?? 'Admin';
const lastName = args.lastName ?? 'Infinitas';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FOUT: VITE_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`▶ Bootstrap admin: ${email}`);
console.log(`  Server: ${SUPABASE_URL}`);
console.log(`  Mode:   ${password ? 'direct password' : 'recovery email'}`);
console.log('');

await main();

async function main() {
  // -- 1. Bestaande auth-user opzoeken
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  let userId;
  if (existing) {
    userId = existing.id;
    console.log(`1️⃣  Auth-user bestaat al — id=${userId}`);
    if (password) {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) {
        console.error('   ✗ Wachtwoord-update faalde:', error.message);
        process.exit(1);
      }
      console.log('   ✓ Wachtwoord overschreven');
    }
  } else {
    console.log(`1️⃣  Auth-user aanmaken…`);
    const params = { email, email_confirm: true };
    if (password) {
      params.password = password;
    } else {
      params.password = crypto.randomUUID() + crypto.randomUUID();
    }
    const { data, error } = await supabase.auth.admin.createUser(params);
    if (error) {
      console.error('   ✗ Aanmaken faalde:', error.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`   ✓ Aangemaakt — id=${userId}`);

    if (!password) {
      const { error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
      });
      if (linkError) {
        console.error('   ⚠️ Recovery-mail faalde:', linkError.message);
      } else {
        console.log('   ✓ Recovery-mail verzonden — klik op de link in je inbox om wachtwoord te kiezen');
      }
    }
  }

  // -- 2. authors-record upsert
  console.log('');
  console.log('2️⃣  authors-record (admin) upserten…');
  const { error: upsertError } = await supabase.from('authors').upsert(
    {
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      is_admin: true,
      is_active: true,
      activated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (upsertError) {
    console.error('   ✗ Upsert faalde:', upsertError.message);
    process.exit(1);
  }
  console.log('   ✓ Admin-record klaar');

  console.log('');
  console.log(`✅ Klaar. Admin-UUID: ${userId}`);
  if (password) {
    console.log(`   Login:    ${email} / ${password}`);
  } else {
    console.log(`   Check je inbox (${email}) voor de set-password mail.`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--email') {
      out.email = argv[++i];
    } else if (arg === '--password') {
      out.password = argv[++i];
    } else if (arg === '--first-name') {
      out.firstName = argv[++i];
    } else if (arg === '--last-name') {
      out.lastName = argv[++i];
    }
  }
  return out;
}
