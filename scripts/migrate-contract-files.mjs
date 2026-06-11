#!/usr/bin/env node
/**
 * Eenmalige datafix — verplaats contract-PDFs van de `statements`-bucket naar
 * de `contracts`-bucket.
 *
 * Achtergrond: `update-charlotte-2.mjs` uploadde de MW-contracten destijds
 * naar `statements/{author_id}/contract/2023/...` (de contracts-bucket
 * bestond toen nog niet). Sinds migration 0016 + commit d1f4e6c verwacht de
 * Contracten-tab de PDFs in de `contracts`-bucket op pad
 * `{author_id}/{contract_id}.pdf`. Dit script verplaatst legacy-bestanden en
 * werkt `contracts.file_path` bij. Idempotent: rijen die al goed staan
 * worden geskipt.
 *
 * Run: node scripts/migrate-contract-files.mjs
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
  console.error('FOUT: env-vars ontbreken');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('▶ Contract-PDFs migreren naar contracts-bucket');
console.log('');
await main();

async function main() {
  // Bestaat de contracts-bucket? Zo niet: migration 0016 eerst runnen.
  const { data: bucket, error: bucketErr } = await supabase.storage.getBucket('contracts');
  if (bucketErr || !bucket) {
    console.error('✗ contracts-bucket niet gevonden in productie.');
    console.error('  Run eerst supabase/migrations/0016_contracts_bucket.sql in de SQL Editor.');
    process.exit(1);
  }

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, author_id, contract_number, contract_name, file_path')
    .not('file_path', 'is', null);

  if (error) {
    console.error('✗ contracts laden mislukt:', error.message);
    process.exit(1);
  }
  if (contracts.length === 0) {
    console.log('Geen contracten met file_path gevonden — niets te doen.');
    return;
  }

  let moved = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of contracts) {
    const targetPath = `${c.author_id}/${c.id}.pdf`;
    const label = c.contract_name ?? c.contract_number;

    if (c.file_path === targetPath) {
      console.log(`⏭  ${label} — staat al goed (${targetPath})`);
      skipped++;
      continue;
    }

    console.log(`▶ ${label}`);
    console.log(`   statements/${c.file_path} → contracts/${targetPath}`);

    const { data: blob, error: dlErr } = await supabase.storage
      .from('statements')
      .download(c.file_path);
    if (dlErr) {
      console.error('   ✗ download uit statements-bucket mislukt:', dlErr.message);
      failed++;
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from('contracts')
      .upload(targetPath, buffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) {
      console.error('   ✗ upload naar contracts-bucket mislukt:', upErr.message);
      failed++;
      continue;
    }

    const { error: updErr } = await supabase
      .from('contracts')
      .update({ file_path: targetPath })
      .eq('id', c.id);
    if (updErr) {
      // DB-update faalde: nieuwe file laten staan kan geen kwaad, maar de rij
      // wijst nog naar het oude pad — oude file dus NIET verwijderen.
      console.error('   ✗ file_path-update mislukt:', updErr.message);
      failed++;
      continue;
    }

    const { error: rmErr } = await supabase.storage.from('statements').remove([c.file_path]);
    if (rmErr) {
      console.warn('   ⚠ oude file verwijderen mislukt (niet kritiek):', rmErr.message);
    }

    console.log(`   ✓ verplaatst (${buffer.length.toLocaleString()} bytes)`);
    moved++;
  }

  console.log('');
  console.log(`✅ Klaar — ${moved} verplaatst, ${skipped} geskipt, ${failed} mislukt`);
  if (failed > 0) {
    process.exit(1);
  }
}
