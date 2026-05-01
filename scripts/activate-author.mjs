#!/usr/bin/env node
/**
 * Activeer een bestaande auteur met een direct password (voor lokale tests).
 *
 * Doet wat de Edge Function `create-accounts` straks in productie doet, maar
 * met een door jou gekozen password ipv recovery-mail. Handig om als auteur
 * te kunnen inloggen voor MVP-test zonder mail-flow te doorlopen.
 *
 * Usage:
 *   node scripts/activate-author.mjs --email cp071021@gmail.com --password Test123
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
if (!args.email || !args.password) {
  console.error('Usage: node scripts/activate-author.mjs --email <addr> --password <pwd>');
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`▶ Activeer auteur: ${args.email}`);
console.log('');

await main();

async function main() {
  // -- Vind authors-record op email
  const { data: author, error } = await supabase
    .from('authors')
    .select('id, first_name, last_name, is_admin, is_active')
    .eq('email', args.email)
    .maybeSingle();

  if (error || !author) {
    console.error(`✗ Geen auteur gevonden met email ${args.email}`);
    console.error('  Check de Authors tabel of voeg eerst de auteur toe.');
    process.exit(1);
  }

  if (author.is_admin) {
    console.error('✗ Dit is een admin-account. Gebruik bootstrap-admin.mjs.');
    process.exit(1);
  }

  console.log(`1️⃣  Auteur gevonden: ${author.first_name} ${author.last_name} (id=${author.id})`);

  // -- Maak/update auth user
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email?.toLowerCase() === args.email.toLowerCase());

  if (existing) {
    console.log(`2️⃣  Auth-user bestaat al — wachtwoord overschrijven…`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: args.password,
    });
    if (updateErr) {
      console.error('   ✗', updateErr.message);
      process.exit(1);
    }
    console.log('   ✓ Wachtwoord gezet');
  } else {
    console.log(`2️⃣  Auth-user aanmaken (UUID matched aan author.id)…`);
    const { error: createErr } = await supabase.auth.admin.createUser({
      id: author.id,
      email: args.email,
      password: args.password,
      email_confirm: true,
    });
    if (createErr) {
      console.error('   ✗', createErr.message);
      process.exit(1);
    }
    console.log('   ✓ Auth-user aangemaakt');
  }

  // -- Zet is_active = true
  console.log('3️⃣  is_active = true zetten…');
  const { error: activateErr } = await supabase
    .from('authors')
    .update({ is_active: true, activated_at: new Date().toISOString() })
    .eq('id', author.id);

  if (activateErr) {
    console.error('   ✗', activateErr.message);
    process.exit(1);
  }
  console.log('   ✓ Geactiveerd');

  console.log('');
  console.log(`✅ Klaar. Login met: ${args.email} / ${args.password}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--email') {
      out.email = argv[++i];
    } else if (arg === '--password') {
      out.password = argv[++i];
    }
  }
  return out;
}
