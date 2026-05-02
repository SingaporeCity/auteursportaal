/**
 * Edge Function: import-authors-csv
 *
 * Bulk-import van auteurs vanuit een NetSuite-CSV-export.
 *
 * Per rij:
 *   1. Valideer alle velden (email-format, IBAN-mod97, postcode NL, BSN-11proef)
 *   2. Tel ontbrekende verplichte velden
 *   3. Bepaal `onboarding_status`:
 *        - alle verplichte velden valide → `pending_admin_review`
 *        - anders → `pending_data` (nullbare velden mogen leeg)
 *   4. INSERT (of UPDATE bij `mode='upsert'` + bestaand email)
 *
 * Verwachte CSV-headers (vaste volgorde):
 *   email,first_name,last_name,phone,street,house_number,postcode,city,
 *   country,birth_date,bsn,bank_account,bic,vendor_id,alliant_id
 *
 * Body: { csv: string, mode: 'create_only' | 'upsert' }
 *
 * @module supabase/functions/import-authors-csv
 */

// @ts-expect-error — Deno standard library
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

// CORS-whitelist (audit H11). Zie create-accounts/index.ts voor toelichting.
const ALLOWED_ORIGINS = ['https://mijn-noordhoff.nl', 'http://localhost:5173'];

const REQUIRED_HEADERS = [
  'email',
  'first_name',
  'last_name',
  'phone',
  'street',
  'house_number',
  'postcode',
  'city',
  'country',
  'birth_date',
  'bsn',
  'bank_account',
  'bic',
  'vendor_id',
  'alliant_id',
] as const;

type Header = (typeof REQUIRED_HEADERS)[number];

/** Velden die verplicht ingevuld moeten zijn voor `pending_admin_review`. */
const REQUIRED_FOR_ACTIVATION: ReadonlySet<Header> = new Set([
  'email',
  'first_name',
  'last_name',
  'phone',
  'street',
  'house_number',
  'postcode',
  'city',
  'country',
  'birth_date',
  'bsn',
  'bank_account',
  'bic',
]);

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  bsn_skipped: number; // aantal rijen waar bestaand BSN niet werd overschreven
  errors: { row: number; email: string; reason: string }[];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin !== null && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin');
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader === null) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (supabaseUrl === '' || supabaseAnonKey === '' || supabaseServiceKey === '') {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }), {
        status: 500,
        headers,
      });
    }

    // Admin-check
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData } = await callerClient.auth.getUser();
    if (!callerData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers,
      });
    }
    const { data: callerAuthor } = await callerClient
      .from('authors')
      .select('is_admin')
      .eq('id', callerData.user.id)
      .maybeSingle();
    if (!callerAuthor?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers,
      });
    }

    // Size-guard (audit-finding M9): voorkom geheugen-uitputting door
    // gigantische payloads. 10 MB ruim genoeg voor 50k CSV-rijen.
    const MAX_BODY_BYTES = 10 * 1024 * 1024;
    const contentLength = Number(req.headers.get('Content-Length') ?? '0');
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Body too large: ${String(contentLength)} > ${String(MAX_BODY_BYTES)} bytes`,
        }),
        { status: 413, headers }
      );
    }

    // Body
    const body = await req.json().catch(() => null);
    if (body === null || typeof body.csv !== 'string') {
      return new Response(JSON.stringify({ error: 'Body must be { csv: string, mode? }' }), {
        status: 400,
        headers,
      });
    }

    // CSV-string size-guard (Content-Length kan ontbreken bij chunked transfer)
    if (body.csv.length > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({
          error: `CSV too large: ${String(body.csv.length)} chars (max ${String(MAX_BODY_BYTES)})`,
        }),
        { status: 413, headers }
      );
    }

    const mode: 'create_only' | 'upsert' = body.mode === 'upsert' ? 'upsert' : 'create_only';

    // Parse + valideer
    const parsed = parseCsv(body.csv);
    if ('error' in parsed) {
      return new Response(JSON.stringify({ error: parsed.error }), { status: 400, headers });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const result: ImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      bsn_skipped: 0,
      errors: [],
    };

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]!;
      const lineNum = i + 2; // header op regel 1

      const validation = validateRow(row);
      if (validation.fatalErrors.length > 0) {
        result.errors.push({
          row: lineNum,
          email: row.email,
          reason: validation.fatalErrors.join('; '),
        });
        result.skipped++;
        continue;
      }

      const status: 'pending_data' | 'pending_admin_review' =
        validation.missingRequired.length === 0 ? 'pending_admin_review' : 'pending_data';

      // Check bestaand — fetch ook `bsn` voor immutability-check
      const { data: existing } = await adminClient
        .from('authors')
        .select('id, bsn')
        .eq('email', row.email)
        .maybeSingle();

      const insertData = buildInsertData(row, status);

      if (existing) {
        if (mode === 'create_only') {
          result.skipped++;
          continue;
        }

        // BSN-immutability: als bestaand record een BSN heeft EN CSV-rij wil
        // hem overschrijven met andere waarde, BSN-veld weglaten uit update.
        // (DB-trigger 0010 zou de UPDATE alsnog blokkeren — dit voorkomt dat
        // de hele rij faalt voor één onoverschrijfbaar veld.)
        const existingBsn = (existing as { bsn: string | null }).bsn;
        if (existingBsn !== null && existingBsn !== '' && existingBsn !== insertData.bsn) {
          delete insertData.bsn;
          result.bsn_skipped++;
        }

        const { error } = await adminClient
          .from('authors')
          .update(insertData)
          .eq('id', existing.id);
        if (error) {
          result.errors.push({ row: lineNum, email: row.email, reason: error.message });
          result.skipped++;
        } else {
          result.updated++;
        }
      } else {
        const { error } = await adminClient.from('authors').insert(insertData);
        if (error) {
          result.errors.push({ row: lineNum, email: row.email, reason: error.message });
          result.skipped++;
        } else {
          result.created++;
        }
      }
    }

    return new Response(JSON.stringify(result), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});

// =============================================================================
// CSV parsing
// =============================================================================
type CsvRow = Record<Header, string>;

function parseCsv(text: string): { rows: CsvRow[] } | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { error: 'CSV must have header + at least 1 data row' };
  }

  const headerLine = lines[0]!;
  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());

  // Verifieer headers
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      return { error: `Missing required column: ${required}` };
    }
  }

  const headerIdx = new Map<Header, number>();
  for (const h of REQUIRED_HEADERS) {
    headerIdx.set(h, headers.indexOf(h));
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const row = {} as CsvRow;
    for (const h of REQUIRED_HEADERS) {
      const idx = headerIdx.get(h)!;
      row[h] = (cells[idx] ?? '').trim();
    }
    rows.push(row);
  }

  return { rows };
}

/** Eenvoudige CSV-line splitter met support voor quoted strings. */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// =============================================================================
// Validatie per row
// =============================================================================
function validateRow(row: CsvRow): { fatalErrors: string[]; missingRequired: Header[] } {
  const fatal: string[] = [];
  const missing: Header[] = [];

  // Email is altijd verplicht (DB NOT NULL + uniek)
  if (row.email === '' || !isValidEmail(row.email)) {
    fatal.push('Invalid or missing email');
  }
  // first_name + last_name zijn ook NOT NULL in DB
  if (row.first_name === '') {
    fatal.push('Missing first_name');
  }
  if (row.last_name === '') {
    fatal.push('Missing last_name');
  }

  // Format-validaties (alleen als waarde aanwezig)
  if (row.postcode !== '' && !isValidPostcodeNL(row.postcode)) {
    fatal.push('Invalid postcode (verwacht: 1234 AB)');
  }
  if (row.bsn !== '' && !isValidBSN(row.bsn)) {
    fatal.push('Invalid BSN (11-proef faalt)');
  }
  if (row.bank_account !== '' && !isValidIBAN(row.bank_account)) {
    fatal.push('Invalid IBAN (mod-97 faalt)');
  }
  if (row.birth_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)) {
    fatal.push('Invalid birth_date (verwacht: YYYY-MM-DD)');
  }

  // Tel ontbrekende verplichte velden
  for (const h of REQUIRED_FOR_ACTIVATION) {
    if (row[h] === '') {
      missing.push(h);
    }
  }

  return { fatalErrors: fatal, missingRequired: missing };
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidPostcodeNL(s: string): boolean {
  return /^\d{4}\s?[A-Za-z]{2}$/.test(s);
}

function isValidBSN(s: string): boolean {
  const digits = s.replace(/\s/g, '');
  if (!/^\d{8,9}$/.test(digits)) return false;
  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(padded[i]) * (9 - i);
  }
  sum -= Number(padded[8]);
  return sum % 11 === 0;
}

function isValidIBAN(s: string): boolean {
  const cleaned = s.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return false;
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  // Bigint mod 97
  let remainder = 0;
  for (const c of numeric) {
    remainder = (remainder * 10 + Number(c)) % 97;
  }
  return remainder === 1;
}

// =============================================================================
// Insert-mapping
// =============================================================================
function buildInsertData(
  row: CsvRow,
  status: 'pending_data' | 'pending_admin_review'
): Record<string, string | null> {
  const nilIfEmpty = (v: string): string | null => (v === '' ? null : v);
  return {
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: nilIfEmpty(row.phone),
    street: nilIfEmpty(row.street),
    house_number: nilIfEmpty(row.house_number),
    postcode: nilIfEmpty(row.postcode),
    city: nilIfEmpty(row.city),
    country: nilIfEmpty(row.country) ?? 'Nederland',
    birth_date: nilIfEmpty(row.birth_date),
    bsn: nilIfEmpty(row.bsn),
    bank_account: nilIfEmpty(row.bank_account),
    bic: nilIfEmpty(row.bic),
    netsuite_vendor_id: nilIfEmpty(row.vendor_id),
    alliant_id: nilIfEmpty(row.alliant_id),
    onboarding_status: status,
  };
}
