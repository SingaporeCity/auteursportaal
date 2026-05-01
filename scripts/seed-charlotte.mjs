#!/usr/bin/env node
/**
 * Seed Charlotte Phillips in het productie Supabase project.
 *
 * Stappen (idempotent):
 *  1. INSERT authors-record (skip als email al bestaat)
 *  2. UPLOAD haar 2 echte PDFs naar Storage bucket `statements`
 *  3. INSERT payment-records gekoppeld aan de Storage paden
 *
 * Maakt GEEN auth-user — dat gebeurt later via de admin-UI activate-flow
 * (Edge Function `create-accounts` + recovery email).
 *
 * Vereist:
 *   .env met SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL
 *   Charlotte's PDFs in ../Royaltyportaal/HTML/
 *
 * Run:
 *   node scripts/seed-charlotte.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FOUT: VITE_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- Charlotte's gegevens (uit NetSuite snapshot) ----
const CHARLOTTE = {
  netsuite_vendor_id: 'V00022638',
  alliant_id: 'NL00117322', // uit Comments-veld; te verifiëren of dit Alliant of ander intern ID is
  email: 'cp071021@gmail.com',
  first_name: 'Charlotte',
  last_name: 'Phillips',
  phone: '+31630242036',
  street: 'Nonnenveld',
  house_number: '96',
  postcode: '4811 DV',
  city: 'Breda',
  country: 'Nederland',
  bank_account: 'NL78ASNB0707684307',
  bic: 'ASNBNL21',
  is_admin: false,
  is_active: false, // admin moet expliciet activeren
};

// ---- PDFs uit oude repo ----
const PDF_SOURCE_DIR = resolve(__dirname, '..', '..', 'Royaltyportaal', 'HTML');

const PDFS = [
  {
    file: 'Jaaropgaven 2025 C.Philips.pdf',
    storagePath: 'jaaropgave/2024/jaaropgave-2024.pdf',
    payment: {
      type: 'jaaropgave',
      year: 2024,
      amount: 0, // admin vult later in
      title_nl: 'Jaaropgave 2024',
      title_en: 'Annual statement 2024',
      payment_date: '2025-01-31',
    },
  },
  {
    file: 'NU_SC_2644446_Charlotte Phillips_202512.pdf',
    storagePath: 'royalty/2024/royalty-statement-2024-12.pdf',
    payment: {
      type: 'royalty',
      year: 2024,
      amount: 0, // admin vult later in
      title_nl: 'Royalty-afrekening december 2024',
      title_en: 'Royalty statement December 2024',
      payment_date: '2024-12-31',
    },
  },
];

async function main() {
  console.log(`▶ Seed Charlotte naar ${SUPABASE_URL}`);
  console.log('');

  // -- Stap 1: authors record
  console.log('1️⃣  Author-record check/insert…');
  const { data: existingAuthor } = await supabase
    .from('authors')
    .select('id, email')
    .eq('email', CHARLOTTE.email)
    .maybeSingle();

  let authorId;
  if (existingAuthor) {
    authorId = existingAuthor.id;
    console.log(`   ✓ Bestaat al — id=${authorId}`);
  } else {
    const { data, error } = await supabase
      .from('authors')
      .insert(CHARLOTTE)
      .select('id')
      .single();
    if (error) {
      console.error('   ✗ Insert faalde:', error.message);
      process.exit(1);
    }
    authorId = data.id;
    console.log(`   ✓ Aangemaakt — id=${authorId}`);
  }

  // -- Stap 2 + 3: PDFs uploaden + payment records
  for (const pdf of PDFS) {
    const sourcePath = resolve(PDF_SOURCE_DIR, pdf.file);
    if (!existsSync(sourcePath)) {
      console.error(`   ✗ PDF niet gevonden: ${sourcePath}`);
      continue;
    }

    const fullStoragePath = `${authorId}/${pdf.storagePath}`;
    console.log('');
    console.log(`2️⃣  Upload "${pdf.file}" → ${fullStoragePath}…`);

    const buffer = readFileSync(sourcePath);
    const { error: uploadError } = await supabase.storage
      .from('statements')
      .upload(fullStoragePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error(`   ✗ Upload faalde: ${uploadError.message}`);
      continue;
    }
    console.log(`   ✓ Geüpload (${buffer.length.toLocaleString()} bytes)`);

    console.log(`3️⃣  Payment-record voor ${pdf.payment.type} ${pdf.payment.year}…`);
    const { error: paymentError } = await supabase.from('payments').upsert(
      {
        author_id: authorId,
        ...pdf.payment,
        file_path: fullStoragePath,
      },
      { onConflict: 'author_id,year,type,file_path' }
    );

    if (paymentError) {
      console.error(`   ✗ Payment insert faalde: ${paymentError.message}`);
      continue;
    }
    console.log(`   ✓ Aangemaakt`);
  }

  console.log('');
  console.log('✅ Klaar. Volgende stap: maak admin-account aan (zie supabase/migrations/README.md)');
  console.log(`   Charlotte's UUID: ${authorId}`);
  console.log(`   Status: is_active = false  → admin moet haar activeren via portaal`);
}

main().catch((err) => {
  console.error('FATAAL:', err);
  process.exit(1);
});
