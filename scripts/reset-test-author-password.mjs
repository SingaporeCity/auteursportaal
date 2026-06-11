#!/usr/bin/env node
/**
 * Zet de wachtwoorden van de dev-testaccounts (auteur + admin) op de waardes
 * van `VITE_DEV_AUTHOR_PASSWORD` / `VITE_DEV_ADMIN_PASSWORD` in de lokale
 * `.env`, zodat de dev quick-login (Ctrl+Shift+L / Ctrl+Shift+A) en de
 * e2e-tests weer kunnen inloggen. De `.env` is daarmee de single source of
 * truth voor wat de wachtwoorden zijn.
 *
 * Run: node scripts/reset-test-author-password.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FOUT: VITE_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY moeten in .env staan');
  process.exit(1);
}

const ACCOUNTS = [
  {
    label: 'auteur',
    email: process.env.VITE_DEV_AUTHOR_EMAIL,
    password: process.env.VITE_DEV_AUTHOR_PASSWORD,
  },
  {
    label: 'admin',
    email: process.env.VITE_DEV_ADMIN_EMAIL,
    password: process.env.VITE_DEV_ADMIN_PASSWORD,
  },
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error('✗ users ophalen mislukt:', error.message);
  process.exit(1);
}

let failed = 0;
for (const account of ACCOUNTS) {
  if (!account.email || !account.password) {
    console.warn(`⏭  ${account.label}: VITE_DEV_*-vars ontbreken in .env — geskipt`);
    continue;
  }

  const user = data.users.find((u) => u.email?.toLowerCase() === account.email.toLowerCase());

  if (user) {
    const { error: updErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: account.password,
    });
    if (updErr) {
      console.error(`✗ ${account.label}: wachtwoord-update mislukt:`, updErr.message);
      failed++;
      continue;
    }
    console.log(`✓ ${account.label} (${account.email}): wachtwoord = waarde uit .env`);
    continue;
  }

  // Geen auth-user: aanmaken kan alleen voor een auteur met bestaande
  // authors-rij. Zelfde patroon als de create-accounts Edge Function:
  // auth-user-id = authors.id, e-mail direct bevestigd.
  const { data: author, error: authorErr } = await supabase
    .from('authors')
    .select('id, must_change_password')
    .eq('email', account.email)
    .maybeSingle();
  if (authorErr || !author) {
    console.error(`✗ ${account.label}: geen auth-user én geen authors-rij voor ${account.email}`);
    failed++;
    continue;
  }

  const { error: createErr } = await supabase.auth.admin.createUser({
    id: author.id,
    email: account.email,
    password: account.password,
    email_confirm: true,
  });
  if (createErr) {
    console.error(`✗ ${account.label}: auth-user aanmaken mislukt:`, createErr.message);
    failed++;
    continue;
  }

  // Quick login moet direct doorlopen — geen force-password-change ervoor.
  if (author.must_change_password) {
    await supabase.from('authors').update({ must_change_password: false }).eq('id', author.id);
  }
  console.log(
    `✓ ${account.label} (${account.email}): auth-user aangemaakt, wachtwoord = waarde uit .env`,
  );
}

if (failed > 0) {
  process.exit(1);
}
console.log('✅ Klaar — quick login werkt nu met de .env-waardes');
