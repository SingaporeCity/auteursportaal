#!/usr/bin/env node
/**
 * Iteratie 2 — Charlotte data-update:
 *  1. Vervang royalty 2025 PDF (juiste 'over 2025' uit Screenshots)
 *  2. Insert 2 MW Methodeovereenkomst contracten (12e + 13e ed., start 2023-01-01)
 *
 * Run: node scripts/update-charlotte-2.mjs
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
  console.error('FOUT: env-vars ontbreken');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SCREENSHOT_DIR = resolve(__dirname, '..', '..', 'Screenshots');
const CHARLOTTE_EMAIL = 'cp071021@gmail.com';

console.log('▶ Charlotte iteratie-2 update');
console.log('');
await main();

async function main() {
  const { data: author } = await supabase
    .from('authors')
    .select('id, first_name, last_name')
    .eq('email', CHARLOTTE_EMAIL)
    .maybeSingle();

  if (!author) {
    console.error('Charlotte niet gevonden');
    process.exit(1);
  }
  console.log(`Auteur: ${author.first_name} ${author.last_name} (${author.id})`);

  // -- 1. Royalty 2025 PDF vervangen
  const pdf2025 = 'Section for Recipient Charlotte Phillips over 2025.pdf';
  const sourcePath = resolve(SCREENSHOT_DIR, pdf2025);
  if (!existsSync(sourcePath)) {
    console.error(`✗ PDF niet gevonden: ${sourcePath}`);
    process.exit(1);
  }
  const newStoragePath = `${author.id}/royalty/2025/royaltyuitkering-2025.pdf`;

  console.log('');
  console.log(`1️⃣  Upload "${pdf2025}" → ${newStoragePath}…`);
  const buffer = readFileSync(sourcePath);
  const { error: upErr } = await supabase.storage
    .from('statements')
    .upload(newStoragePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) {
    console.error('   ✗', upErr.message);
    process.exit(1);
  }
  console.log(`   ✓ Geüpload (${buffer.length.toLocaleString()} bytes)`);

  console.log('   Update payment.file_path naar nieuwe pad…');
  const { error: updPathErr } = await supabase
    .from('payments')
    .update({ file_path: newStoragePath })
    .eq('author_id', author.id)
    .eq('type', 'royalty')
    .eq('year', 2025);
  if (updPathErr) {
    console.error('   ✗', updPathErr.message);
    process.exit(1);
  }
  console.log('   ✓ payment.file_path bijgewerkt');

  // -- 2. MW Methodeovereenkomst contracten
  const contracts = [
    {
      pdf: 'MW Methodeovereenkomst 12e-13e ed. releases 12.1&13.1_Boom, J. van den.pdf',
      record: {
        author_id: author.id,
        contract_number: 'MW-12.1',
        contract_name: 'MW Methodeovereenkomst 12e editie',
        royalty_percentage: 11.0,
        start_date: '2023-01-01',
      },
      storagePath: `${author.id}/contract/2023/mw-methodeovereenkomst-12e.pdf`,
    },
    {
      pdf: 'MW Methodeovereenkomst 12e-13e ed. releases 12.1&13.1_Boom, J. van den (1).pdf',
      record: {
        author_id: author.id,
        contract_number: 'MW-13.1',
        contract_name: 'MW Methodeovereenkomst 13e editie',
        royalty_percentage: 11.0,
        start_date: '2023-01-01',
      },
      storagePath: `${author.id}/contract/2023/mw-methodeovereenkomst-13e.pdf`,
    },
  ];

  for (const c of contracts) {
    const src = resolve(SCREENSHOT_DIR, c.pdf);
    if (!existsSync(src)) {
      console.error(`   ✗ niet gevonden: ${src}`);
      continue;
    }

    console.log('');
    console.log(`2️⃣  ${c.record.contract_name}…`);
    const buf = readFileSync(src);
    const { error: cUp } = await supabase.storage
      .from('statements')
      .upload(c.storagePath, buf, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (cUp) {
      console.error('   ✗ upload:', cUp.message);
      continue;
    }
    console.log(`   ✓ geüpload (${buf.length.toLocaleString()} bytes)`);

    // Check of contract met dit nummer al bestaat
    const { data: existing } = await supabase
      .from('contracts')
      .select('id')
      .eq('author_id', author.id)
      .eq('contract_number', c.record.contract_number)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from('contracts')
        .update({ ...c.record, file_path: c.storagePath })
        .eq('id', existing.id);
      if (updErr) {
        console.error('   ✗ update:', updErr.message);
      } else {
        console.log('   ✓ contract record bijgewerkt');
      }
    } else {
      const { error: insErr } = await supabase
        .from('contracts')
        .insert({ ...c.record, file_path: c.storagePath });
      if (insErr) {
        console.error('   ✗ insert:', insErr.message);
      } else {
        console.log('   ✓ contract record aangemaakt');
      }
    }
  }

  console.log('');
  console.log('✅ Klaar');
}
