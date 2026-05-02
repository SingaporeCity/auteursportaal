/**
 * Edge Function: export-authors-csv
 *
 * Round-trip-sync naar NetSuite. Genereert een CSV met alle auteursgegevens
 * die zijn gewijzigd of nieuw geactiveerd sinds vorige export. Admin
 * downloadt + uploadt naar Noordhoff SharePoint, NetSuite-team verwerkt.
 *
 * Veiligheid (zie ook docs/SECURITY.md sectie 'Data egress'):
 *   - Admin-only via JWT-check
 *   - Audit-row in `data_exports` met sha256-hash van CSV-content (anti-tamper)
 *   - `last_exported_at` per geexporteerde rij wordt geupdate
 *   - CSV bevat geen wachtwoorden of auth-tokens
 *
 * Body (POST):
 *   { reason?: string } — optioneel: vrije tekst voor audit-trail
 *
 * Response:
 *   Content-Type: text/csv
 *   Content-Disposition: attachment; filename="authors-export-YYYYMMDD-HHMMSS.csv"
 *   X-Export-Id: <uuid van data_exports row>
 *   X-Export-Hash: <sha256 hex>
 *   X-Export-Row-Count: <int>
 *   <csv-content>
 *
 * @module supabase/functions/export-authors-csv
 */

// @ts-expect-error — Deno standard library
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

const ALLOWED_ORIGINS = [
  'https://mijn-noordhoff.nl',
  'https://singaporecity.github.io',
  'http://localhost:5173',
];

// CSV-format moet symmetrisch zijn met import-authors-csv
const CSV_HEADERS = [
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

type Header = (typeof CSV_HEADERS)[number];

interface AuthorExportRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  street: string | null;
  house_number: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
  birth_date: string | null;
  bsn: string | null;
  bank_account: string | null;
  bic: string | null;
  netsuite_vendor_id: string | null;
  alliant_id: string | null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin !== null && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Export-Id, X-Export-Hash, X-Export-Row-Count',
    Vary: 'Origin',
  };
}

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin');
  const baseHeaders = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader === null) {
      return jsonError(baseHeaders, 401, 'No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (supabaseUrl === '' || supabaseAnonKey === '' || supabaseServiceKey === '') {
      return jsonError(baseHeaders, 500, 'Server configuration missing');
    }

    // -- 1. Admin-check via caller-JWT
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerData?.user) {
      return jsonError(baseHeaders, 401, 'Invalid token');
    }
    const callerId: string = callerData.user.id;

    const { data: callerAuthor } = await callerClient
      .from('authors')
      .select('is_admin')
      .eq('id', callerId)
      .maybeSingle();
    if (!callerAuthor?.is_admin) {
      return jsonError(baseHeaders, 403, 'Admin access required');
    }

    // -- 2. Body
    const body = await req.json().catch(() => ({}));
    const reason: string | null =
      typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : null;

    // -- 3. Query alle non-admin auteurs, filter "sinds vorige export" in JS
    //    (PostgREST kan geen column-to-column comparisons in `.or()`)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rows, error: queryErr } = await adminClient
      .from('authors')
      .select(
        'id, email, first_name, last_name, phone, street, house_number, postcode, city, country, birth_date, bsn, bank_account, bic, netsuite_vendor_id, alliant_id, last_exported_at, updated_at'
      )
      .eq('is_admin', false)
      .order('last_name', { ascending: true });

    if (queryErr) {
      return jsonError(baseHeaders, 500, `Query failed: ${queryErr.message}`);
    }

    // Filter: nieuw (nog nooit geexporteerd) OR gewijzigd na vorige export
    const filtered = (rows ?? []).filter(
      (r: { last_exported_at: string | null; updated_at: string }) =>
        r.last_exported_at === null || r.last_exported_at < r.updated_at
    ) as AuthorExportRow[];

    if (filtered.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'no_changes',
          message: 'Geen wijzigingen sinds vorige export',
        }),
        { status: 200, headers: { ...baseHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -- 4. Build CSV
    const csv = buildCsv(filtered);
    const fileHash = await sha256Hex(csv);
    const ts = formatTimestamp(new Date());
    const fileName = `authors-export-${ts}.csv`;

    // -- 5. Audit-row insert
    const { data: auditRow, error: auditErr } = await adminClient
      .from('data_exports')
      .insert({
        exported_by: callerId,
        row_count: filtered.length,
        row_ids: filtered.map((r) => r.id),
        file_hash: fileHash,
        file_name: fileName,
        reason,
      })
      .select('id')
      .single();

    if (auditErr) {
      return jsonError(baseHeaders, 500, `Audit insert failed: ${auditErr.message}`);
    }

    // -- 6. last_exported_at bijwerken voor de geexporteerde rijen
    const exportedAt = new Date().toISOString();
    const { error: updErr } = await adminClient
      .from('authors')
      .update({ last_exported_at: exportedAt })
      .in(
        'id',
        filtered.map((r) => r.id)
      );

    if (updErr) {
      // Audit-row staat al; logfout maar return CSV alsnog (admin kan handmatig
      // herstellen via SQL editor). Beter dan dubbele export.
      console.error('last_exported_at update failed:', updErr.message);
    }

    // -- 7. Stream CSV terug
    return new Response(csv, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Export-Id': auditRow.id,
        'X-Export-Hash': fileHash,
        'X-Export-Row-Count': String(filtered.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(baseHeaders, 500, message);
  }
});

function jsonError(baseHeaders: Record<string, string>, status: number, msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
  });
}

// =============================================================================
// CSV building
// =============================================================================
function buildCsv(rows: AuthorExportRow[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const dataLines = rows.map((row) => {
    const values: Record<Header, string> = {
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone ?? '',
      street: row.street ?? '',
      house_number: row.house_number ?? '',
      postcode: row.postcode ?? '',
      city: row.city ?? '',
      country: row.country ?? '',
      birth_date: row.birth_date ?? '',
      bsn: row.bsn ?? '',
      bank_account: row.bank_account ?? '',
      bic: row.bic ?? '',
      vendor_id: row.netsuite_vendor_id ?? '',
      alliant_id: row.alliant_id ?? '',
    };
    return CSV_HEADERS.map((h) => csvEscape(values[h])).join(',');
  });
  return [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

function csvEscape(value: string): string {
  // RFC-4180: quote als waarde komma, quote, newline of leading/trailing spaces bevat
  if (/[,"\n\r]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// =============================================================================
// Utils
// =============================================================================
async function sha256Hex(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    '-' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}
