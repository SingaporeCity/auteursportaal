/**
 * Edge Function: bulk-create-existing-authors
 *
 * Bulk-import van auteurs die al bekend zijn bij Noordhoff (NetSuite) maar nog
 * niet in het portaal. Frontend uploadt een Excel, parset client-side met
 * SheetJS, en stuurt de rijen als JSON.
 *
 * Per rij:
 *   1. Normaliseer + valideer.
 *   2. Maak Supabase auth-user met password 'Noordhoff' + email_confirm:true
 *      (Supabase stuurt 0 mails — geen bevestiging, geen recovery).
 *   3. INSERT authors-rij met dezelfde UUID en status='pending_data' (phone +
 *      initials ontbreken in Excel-template, dus auteur moet zelf aanvullen).
 *   4. Bij INSERT-fout: rollback de auth-user via auth.admin.deleteUser.
 *
 * Bewust GEEN call naar `import_author_row` RPC — die functie heeft een fixed
 * GRANT EXECUTE op exact 17 args en geen `p_id`-param, en uitbreiden zou het
 * bestaande CSV-import-pad breken. Direct adminClient.from('authors').insert()
 * is veilig: de relevante triggers (`enforce_onboarding_transition`,
 * `bsn_immutable`) zijn alleen BEFORE UPDATE, niet BEFORE INSERT.
 *
 * Body:
 *   { rows: Array<{
 *       vendor_id, internal_id, name, address_line, city, zip, country,
 *       bsn, email, bic, iban, birth_date  // birth_date = ISO 'YYYY-MM-DD' of ''
 *     }>
 *   }
 *
 * Password is server-side hardcoded ('Noordhoff') — bewust géén client-input
 * tijdens test-fase. Wanneer dit later vervangen wordt door echte invite-mail-
 * flow: vervang door random password + verstuur via sendRecoveryEmail.
 *
 * @module supabase/functions/bulk-create-existing-authors
 */

// @ts-expect-error — Deno standard library, runtime resolution
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

const ALLOWED_ORIGINS = ['https://mijn-noordhoff.nl', 'http://localhost:5173'];

/** Initieel wachtwoord voor alle test-auteurs. Hardcoded — niet uit body. */
const INITIAL_PASSWORD = 'Noordhoff';

interface InputRow {
  vendor_id?: string;
  internal_id?: string;
  name?: string;
  address_line?: string;
  city?: string;
  zip?: string;
  country?: string;
  bsn?: string;
  email?: string;
  bic?: string;
  iban?: string;
  birth_date?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
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

    // -- Admin-check
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
    const actorId = callerData.user.id;

    // -- Rate-limit (10 imports/uur per admin, zelfde policy als CSV-import)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rateOk, error: rateErr } = await adminClient.rpc('check_rate_limit', {
      p_actor: actorId,
      p_action: 'bulk_create_existing_authors',
      p_max: 10,
      p_window_seconds: 3600,
    });
    if (rateErr || rateOk !== true) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Probeer over een uur opnieuw.' }),
        { status: 429, headers }
      );
    }

    // -- Size-guard (10MB ruim genoeg voor 50k JSON-rijen)
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

    // -- Body parse
    const body = await req.json().catch(() => null);
    if (body === null || !Array.isArray(body.rows)) {
      return new Response(JSON.stringify({ error: 'Body must be { rows: [...] }' }), {
        status: 400,
        headers,
      });
    }
    const rows = body.rows as InputRow[];

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Geen rijen om te importeren' }), {
        status: 400,
        headers,
      });
    }

    // -- Per rij: valideer → auth-user → authors-rij
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]!;
      const lineNum = i + 2; // Excel header is regel 1, data start regel 2
      const email = (raw.email ?? '').trim().toLowerCase();

      // -- Normaliseer
      const normalized = normalizeRow(raw);

      // -- Valideer
      const validation = validateNormalized(normalized);
      if (validation.length > 0) {
        result.errors.push({ row: lineNum, email, reason: validation.join('; ') });
        result.skipped++;
        continue;
      }

      // -- Auth-user eerst (email_confirm:true → 0 mails)
      const author_id = crypto.randomUUID();
      const { error: authErr } = await adminClient.auth.admin.createUser({
        id: author_id,
        email: normalized.email,
        password: INITIAL_PASSWORD,
        email_confirm: true,
      });
      if (authErr) {
        result.errors.push({
          row: lineNum,
          email,
          reason: `Auth-user aanmaken faalde: ${authErr.message}`,
        });
        result.skipped++;
        continue;
      }

      // -- Authors-rij INSERT met dezelfde UUID
      const { error: insertErr } = await adminClient.from('authors').insert({
        id: author_id,
        email: normalized.email,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        bsn: normalized.bsn === '' ? null : normalized.bsn,
        birth_date: normalized.birth_date === '' ? null : normalized.birth_date,
        street: normalized.street === '' ? null : normalized.street,
        house_number: normalized.house_number === '' ? null : normalized.house_number,
        postcode: normalized.postcode === '' ? null : normalized.postcode,
        city: normalized.city === '' ? null : normalized.city,
        country: normalized.country,
        bank_account: normalized.iban === '' ? null : normalized.iban,
        bic: normalized.bic === '' ? null : normalized.bic,
        netsuite_vendor_id: normalized.vendor_id === '' ? null : normalized.vendor_id,
        alliant_id: normalized.alliant_id === '' ? null : normalized.alliant_id,
        onboarding_status: 'pending_data',
      });

      if (insertErr) {
        // Rollback: orphaned auth-user opruimen zodat re-import kan slagen
        await adminClient.auth.admin.deleteUser(author_id).catch(() => {
          // Best-effort cleanup; admin moet het zelf opruimen in dashboard
        });
        result.errors.push({
          row: lineNum,
          email,
          reason: `Authors-rij INSERT faalde: ${insertErr.message}`,
        });
        result.skipped++;
        continue;
      }

      result.created++;
    }

    // -- Audit-log: één samenvattende rij. Hergebruik bestaande enum-waarde
    // `csv_imported` (zie 0012_audit_actions.sql:30-54); source-flag in
    // metadata onderscheidt Excel vs CSV.
    try {
      await adminClient.from('audit_actions').insert({
        action_type: 'csv_imported',
        actor_id: actorId,
        target_table: 'authors',
        metadata: {
          source: 'excel',
          rows_total: rows.length,
          created: result.created,
          skipped: result.skipped,
          error_count: result.errors.length,
        },
      });
    } catch {
      // Audit-failure mag main-flow niet stoppen
    }

    return new Response(JSON.stringify(result), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});

// =============================================================================
// Normalisatie
// =============================================================================
interface NormalizedRow {
  email: string;
  first_name: string;
  last_name: string;
  street: string;
  house_number: string;
  postcode: string;
  city: string;
  country: string;
  bsn: string;
  bic: string;
  iban: string;
  birth_date: string; // ISO YYYY-MM-DD of '' (leeg = NULL in DB)
  vendor_id: string;
  alliant_id: string;
}

function normalizeRow(raw: InputRow): NormalizedRow {
  const { first_name, last_name } = splitName(raw.name ?? '');
  const { street, house_number } = splitAddress(raw.address_line ?? '');
  return {
    email: (raw.email ?? '').trim().toLowerCase(),
    first_name,
    last_name,
    street,
    house_number,
    postcode: normalizePostcode(raw.zip ?? ''),
    city: (raw.city ?? '').trim(),
    country: normalizeCountry(raw.country ?? ''),
    bsn: (raw.bsn ?? '').replace(/\s/g, ''),
    bic: (raw.bic ?? '').trim().toUpperCase(),
    iban: (raw.iban ?? '').replace(/\s/g, '').toUpperCase(),
    birth_date: (raw.birth_date ?? '').trim(),
    vendor_id: (raw.vendor_id ?? '').trim(),
    alliant_id: (raw.internal_id ?? '').trim(),
  };
}

/**
 * Splits Excel-"Name" in first/last. Strip leading punctuatie. Detecteer
 * bedrijfssuffix (bv, B.V., NV, N.V., V.O.F., stichting, etc.) → `first_name`
 * krijgt em-dash en de volledige naam wordt last_name. Anders person-split.
 */
export function splitName(rawName: string): { first_name: string; last_name: string } {
  const cleaned = rawName.replace(/^[.\s]+/, '').replace(/\s+$/, '');
  if (cleaned === '') {
    return { first_name: '—', last_name: '—' };
  }
  if (COMPANY_SUFFIX_RE.test(cleaned)) {
    return { first_name: '—', last_name: truncate(cleaned, 100) };
  }
  const idx = cleaned.indexOf(' ');
  if (idx === -1) {
    // Eén woord — onmogelijk om te splitsen; zet als last_name met em-dash
    return { first_name: '—', last_name: truncate(cleaned, 100) };
  }
  return {
    first_name: truncate(cleaned.slice(0, idx), 100),
    last_name: truncate(cleaned.slice(idx + 1).trim(), 100),
  };
}

const COMPANY_SUFFIX_RE =
  /\b(b\.?v\.?|n\.?v\.?|v\.?o\.?f\.?|vof|stichting|holding|gmbh|ltd|llc|s\.?a\.?|coöperatie|coop)\b/i;

/**
 * Splits "Waag 61" in street + huisnummer. Regex pakt het eerste cijfer-token
 * vanaf rechts; voorzet/suffix-letters worden onderdeel van het huisnummer
 * (bv. "Hoofdstraat 12-A" → street="Hoofdstraat", hnr="12-A").
 */
export function splitAddress(line: string): { street: string; house_number: string } {
  const trimmed = line.trim();
  if (trimmed === '') {
    return { street: '', house_number: '' };
  }
  const m = trimmed.match(/^(.+?)\s+(\d+[\d\s\-/A-Za-z]*)$/);
  if (m === null) {
    return { street: truncate(trimmed, 255), house_number: '' };
  }
  return {
    street: truncate(m[1]!.trim(), 255),
    house_number: truncate(m[2]!.trim(), 20),
  };
}

function normalizeCountry(c: string): string {
  const lower = c.trim().toLowerCase();
  if (lower === '' || lower === 'netherlands' || lower === 'nederland' || lower === 'nl') {
    return 'Nederland';
  }
  return c.trim();
}

function normalizePostcode(p: string): string {
  // NL-postcode normaliseren naar "1234 AB" (spatie tussen cijfers en letters)
  const compact = p.replace(/\s/g, '').toUpperCase();
  const m = compact.match(/^(\d{4})([A-Z]{2})$/);
  if (m === null) {
    return p.trim();
  }
  return `${m[1]!} ${m[2]!}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// =============================================================================
// Validatie
// =============================================================================
function validateNormalized(row: NormalizedRow): string[] {
  const errs: string[] = [];
  if (row.email === '' || !isValidEmail(row.email)) {
    errs.push('Email ongeldig of leeg');
  }
  if (row.first_name === '' || row.last_name === '') {
    errs.push('Naam kon niet worden gesplitst (first_name of last_name leeg)');
  }
  if (row.postcode !== '' && !isValidPostcodeNL(row.postcode)) {
    errs.push(`Postcode ongeldig (verwacht "1234 AB"): "${row.postcode}"`);
  }
  if (row.bsn !== '' && !isValidBSN(row.bsn)) {
    errs.push('BSN ongeldig (11-proef faalt)');
  }
  if (row.iban !== '' && !isValidIBAN(row.iban)) {
    errs.push('IBAN ongeldig (mod-97 faalt)');
  }
  if (row.birth_date !== '' && !isPlausibleBirthDate(row.birth_date)) {
    errs.push(`Geboortedatum implausibel of foutief geformatteerd: "${row.birth_date}"`);
  }
  return errs;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidPostcodeNL(s: string): boolean {
  return /^\d{4}\s?[A-Za-z]{2}$/.test(s);
}

function isValidBSN(s: string): boolean {
  if (!/^\d{8,9}$/.test(s)) return false;
  const padded = s.padStart(9, '0');
  if (padded === '000000000') return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(padded[i]) * (9 - i);
  }
  sum -= Number(padded[8]);
  return sum % 11 === 0;
}

function isValidIBAN(s: string): boolean {
  if (s.length < 15 || s.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged
    .split('')
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  let remainder = 0;
  for (const c of numeric) {
    remainder = (remainder * 10 + Number(c)) % 97;
  }
  return remainder === 1;
}

/**
 * Plausibility-check voor `birth_date`: ISO YYYY-MM-DD, year ∈ [1920, 2010].
 * Excel-placeholder "1/1/00" wordt als serial 1 → 1900-01-01 → buiten range
 * en dus afgekeurd. Het bovenste plafond (2010) houdt minderjarigen buiten
 * de auteurslijst.
 */
export function isPlausibleBirthDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const year = Number(iso.slice(0, 4));
  return year >= 1920 && year <= 2010;
}
