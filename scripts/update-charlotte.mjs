#!/usr/bin/env node
/**
 * Update Charlotte's payments + voeg 2 historische uitkeringen toe.
 *
 * Veranderingen:
 *  - Bestaande royalty 2024 → year=2025, "Royaltyuitkering over 2025", betaald 31-03-2026
 *  - Bestaande jaaropgave 2024 → year=2025, "Jaaropgave 2025", verstrekt 31-12-2025
 *  - INSERT royalty 2024 (€26.701,82, betaald 31-03-2025)
 *  - INSERT royalty 2023 (€23.693,65, betaald 31-03-2024)
 *  - PDFs uit Coding NH/Screenshots/ uploaden naar Storage
 *
 * Run:
 *   node scripts/update-charlotte.mjs                              # standaard
 *   node scripts/update-charlotte.mjs --amount-2025 28000          # met bedrag 2025
 *   node scripts/update-charlotte.mjs --amount-2025 28000 \
 *     --forecast-2027-min 26000 --forecast-2027-max 34000          # ook prognose
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '..', '.env') });

const args = parseArgs(process.argv.slice(2));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('FOUT: env-vars ontbreken');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SCREENSHOT_DIR = resolve(__dirname, '..', '..', 'Screenshots');

console.log('▶ Update Charlotte');
console.log('');

await main();

async function main() {
  // Find Charlotte
  const { data: author, error: aErr } = await supabase
    .from('authors')
    .select('id, first_name, last_name')
    .eq('email', 'cp071021@gmail.com')
    .maybeSingle();

  if (aErr || !author) {
    console.error('Charlotte niet gevonden in authors-tabel');
    process.exit(1);
  }

  console.log(`Auteur: ${author.first_name} ${author.last_name} (${author.id})`);
  console.log('');

  // -- 1. Update bestaande royalty 2024 → 2025
  console.log('1️⃣  Bestaande royalty record updaten (2024 → 2025)…');
  const royaltyUpdate = {
    year: 2025,
    title_nl: 'Royaltyuitkering over 2025',
    title_en: 'Royalty payment 2025',
    payment_date: '2026-03-31',
  };
  if (args.amount_2025 !== undefined) {
    royaltyUpdate.amount = args.amount_2025;
  }

  const { error: updRoyErr } = await supabase
    .from('payments')
    .update(royaltyUpdate)
    .eq('author_id', author.id)
    .eq('type', 'royalty')
    .eq('year', 2024);

  if (updRoyErr) {
    console.error('   ✗', updRoyErr.message);
  } else {
    console.log(`   ✓ Royalty record → 2025 (bedrag: ${args.amount_2025 ?? 'ongewijzigd'})`);
  }

  // -- 2. Update bestaande jaaropgave 2024 → 2025
  console.log('');
  console.log('2️⃣  Bestaande jaaropgave record updaten (2024 → 2025)…');
  const { error: updJaarErr } = await supabase
    .from('payments')
    .update({
      year: 2025,
      title_nl: 'Jaaropgave 2025',
      title_en: 'Annual statement 2025',
      payment_date: '2025-12-31',
    })
    .eq('author_id', author.id)
    .eq('type', 'jaaropgave')
    .eq('year', 2024);

  if (updJaarErr) {
    console.error('   ✗', updJaarErr.message);
  } else {
    console.log('   ✓ Jaaropgave record → 2025');
  }

  // -- 3 + 4. Upload + insert historische royalty's
  await seedHistoric(author.id, {
    pdfFile: 'Section for Recipient Charlotte Phillips over 2024.pdf',
    storagePath: `${author.id}/royalty/2024/royaltyuitkering-2024.pdf`,
    payment: {
      author_id: author.id,
      year: 2024,
      type: 'royalty',
      amount: 26701.82,
      title_nl: 'Royaltyuitkering over 2024',
      title_en: 'Royalty payment 2024',
      payment_date: '2025-03-31',
    },
  });

  await seedHistoric(author.id, {
    pdfFile: 'Section for Recipient Charlotte Phillips - over 2023.pdf',
    storagePath: `${author.id}/royalty/2023/royaltyuitkering-2023.pdf`,
    payment: {
      author_id: author.id,
      year: 2023,
      type: 'royalty',
      amount: 23693.65,
      title_nl: 'Royaltyuitkering over 2023',
      title_en: 'Royalty payment 2023',
      payment_date: '2024-03-31',
    },
  });

  // -- 5. Forecast 2027 (optioneel)
  if (args.forecast_2027_min !== undefined && args.forecast_2027_max !== undefined) {
    console.log('');
    console.log('5️⃣  Forecast 2027 upserten…');
    const { error: fcErr } = await supabase.from('forecasts').upsert(
      {
        author_id: author.id,
        year: 2027,
        min_amount: args.forecast_2027_min,
        max_amount: args.forecast_2027_max,
      },
      { onConflict: 'author_id,year' }
    );
    if (fcErr) {
      console.error('   ✗', fcErr.message);
    } else {
      console.log(`   ✓ €${args.forecast_2027_min} — €${args.forecast_2027_max}`);
    }
  }

  console.log('');
  console.log('✅ Klaar.');
}

async function seedHistoric(authorId, { pdfFile, storagePath, payment }) {
  console.log('');
  console.log(`📄 ${pdfFile}…`);

  const sourcePath = resolve(SCREENSHOT_DIR, pdfFile);
  if (!existsSync(sourcePath)) {
    console.error(`   ✗ niet gevonden: ${sourcePath}`);
    return;
  }

  // Upload PDF
  const buffer = readFileSync(sourcePath);
  const { error: upErr } = await supabase.storage
    .from('statements')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) {
    console.error('   ✗ upload:', upErr.message);
    return;
  }
  console.log(`   ✓ geüpload (${buffer.length.toLocaleString()} bytes)`);

  // Upsert payment
  const { error: payErr } = await supabase.from('payments').upsert(
    { ...payment, file_path: storagePath },
    { onConflict: 'author_id,year,type,file_path' }
  );
  if (payErr) {
    console.error('   ✗ payment:', payErr.message);
    return;
  }
  console.log(`   ✓ payment record (€${payment.amount}) ${payment.payment_date}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--amount-2025') out.amount_2025 = Number(argv[++i]);
    else if (flag === '--forecast-2027-min') out.forecast_2027_min = Number(argv[++i]);
    else if (flag === '--forecast-2027-max') out.forecast_2027_max = Number(argv[++i]);
  }
  return out;
}
