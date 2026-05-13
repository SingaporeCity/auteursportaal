/**
 * Gedeelde core voor statement-upload (zowel single-upload via admin-author-
 * card als bulk-upload via admin-toolbar).
 *
 * Verantwoordelijkheden:
 *   - Pad-conventie voor de `statements` storage-bucket.
 *   - Filename-sanitization (storage accepteert geen rare karakters).
 *   - Upload van één PDF naar storage.
 *   - INSERT van één `payments`-rij met silent-skip op duplicate
 *     (UNIQUE-constraint op `(author_id, year, type, file_path)`).
 *
 * @module lib/statement-upload-core
 */

import { supabase } from '@/lib/supabase';
import type { PaymentType } from '@/types/db';

/** Max bestandsgrootte per PDF (Supabase Storage free-tier default = 50 MB). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Storage-bucket-naam (zie `0002_storage_buckets.sql:16`). */
export const STATEMENTS_BUCKET = 'statements';

/** Postgres-foutcode voor `unique_violation` — gebruikt voor silent-duplicate. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Maakt het pad voor een statement-PDF in de storage-bucket. Conventie matcht
 * de RLS-policy (`0002_storage_buckets.sql:21-27`): eerste path-segment is
 * de auteur-UUID, daar wordt op gefilterd voor "auteur ziet eigen statements".
 *
 * @example buildStoragePath('uuid', 'royalty', 2025, 'NU_SC_…_202512.pdf')
 *   === 'uuid/royalty/2025/NU_SC_…_202512.pdf'
 */
export function buildStoragePath(
  authorId: string,
  type: PaymentType,
  year: number,
  filename: string
): string {
  return `${authorId}/${type}/${String(year)}/${sanitizeFilename(filename)}`;
}

/**
 * Vervangt elk karakter dat geen letter/cijfer/punt/streepje is door een
 * underscore en kapt af op 100 tekens. Voorkomt Supabase-storage-fouten
 * door spaties, accenten of slashes in NetSuite-export-namen.
 *
 * @example sanitizeFilename('NU_SC_123_G. de Jong_202512.pdf')
 *   === 'NU_SC_123_G._de_Jong_202512.pdf'
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

export interface UploadResult {
  ok: boolean;
  /** Specifieke duplicate-storage-fout — caller mag dan toch de INSERT proberen. */
  duplicate?: boolean;
  error?: string;
}

/**
 * Upload één PDF naar de `statements`-bucket. `upsert:false` zodat een tweede
 * upload met dezelfde naam een conflict geeft i.p.v. stilletjes overschrijven.
 */
export async function uploadStatementFile(file: File, path: string): Promise<UploadResult> {
  const { error } = await supabase.storage.from(STATEMENTS_BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error === null) {
    return { ok: true };
  }
  // Supabase storage geeft 'Duplicate' / 409 wanneer het pad al bestaat.
  // We tolereren dat alleen — de bijbehorende payments-rij moet dan ook
  // bestaan (anders heeft een eerdere upload-attempt halverwege gefaald).
  if (/duplicate/i.test(error.message) || error.message.includes('409')) {
    return { ok: false, duplicate: true, error: error.message };
  }
  return { ok: false, error: error.message };
}

/**
 * Verwijder een PDF uit de storage. Best-effort — gebruikt als compensatie
 * wanneer de bijbehorende `payments`-INSERT faalt en we geen wees-bestand
 * willen achterlaten.
 */
export async function removeStatementFile(path: string): Promise<void> {
  await supabase.storage
    .from(STATEMENTS_BUCKET)
    .remove([path])
    .catch(() => {
      // Best-effort — admin kan zelf opruimen via dashboard als dit faalt.
    });
}

export interface PaymentInsertInput {
  author_id: string;
  type: PaymentType;
  year: number;
  amount: number;
  title_nl: string;
  title_en?: string;
  payment_date: string | null;
  file_path: string;
}

export type PaymentInsertResult = 'created' | 'duplicate' | { error: string };

/**
 * INSERT in `payments` met silent-handling van de UNIQUE-constraint
 * `(author_id, year, type, file_path)` uit `0001_initial_schema.sql:90`.
 * Caller hoeft duplicates niet zelf te detecteren — de DB doet dat atomisch
 * en wij vertalen `23505` naar `'duplicate'`.
 */
export async function insertPaymentRecord(input: PaymentInsertInput): Promise<PaymentInsertResult> {
  const { error } = await supabase.from('payments').insert({
    author_id: input.author_id,
    type: input.type,
    year: input.year,
    amount: input.amount,
    title_nl: input.title_nl,
    title_en: input.title_en ?? null,
    payment_date: input.payment_date,
    file_path: input.file_path,
  });
  if (error === null) {
    return 'created';
  }
  if (error.code === PG_UNIQUE_VIOLATION) {
    return 'duplicate';
  }
  return { error: error.message };
}
