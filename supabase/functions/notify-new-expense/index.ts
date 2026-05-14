/**
 * Edge Function: notify-new-expense
 *
 * Stuurt een mail naar `rights@noordhoff.nl` (configureerbaar) zodra een
 * auteur een nieuwe declaratie heeft ingediend. De ingeleverde PDF wordt
 * als attachment meegestuurd. Caller-flow:
 *
 *   1. Auteur upload PDF + INSERT in `expenses` (frontend).
 *   2. Frontend roept deze function aan met `{ expense_id }`.
 *   3. Function checkt caller-permissie (eigenaar of admin) → laadt
 *      expense + author + PDF → POST naar Resend.
 *
 * Vereiste secrets (`supabase secrets set ...`):
 *   - `RESEND_API_KEY` — re_xxxx van https://resend.com/api-keys
 *   - `EXPENSE_NOTIFY_TO` — bestemming (default `rights@noordhoff.nl`)
 *   - `EXPENSE_NOTIFY_FROM` — afzender (default `onboarding@resend.dev`,
 *     vereist anders een geverifieerd domein bij Resend)
 *
 * @module supabase/functions/notify-new-expense
 */

// @ts-expect-error — Deno standard library, runtime resolution
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

const ALLOWED_ORIGINS = ['https://mijn-noordhoff.nl', 'http://localhost:5173'];
const DEFAULT_TO = 'rights@noordhoff.nl';
const DEFAULT_FROM = 'Auteursportaal <onboarding@resend.dev>';

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin !== null && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

interface AuthorInfo {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  netsuite_vendor_id: string | null;
}

interface ExpenseInfo {
  id: string;
  author_id: string;
  description: string;
  amount: number;
  currency: string;
  expense_type: string;
  receipt_path: string;
  submitted_at: string;
}

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin');
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
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
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const notifyTo = Deno.env.get('EXPENSE_NOTIFY_TO') ?? DEFAULT_TO;
    const notifyFrom = Deno.env.get('EXPENSE_NOTIFY_FROM') ?? DEFAULT_FROM;

    if (supabaseUrl === '' || supabaseAnonKey === '' || supabaseServiceKey === '') {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }), {
        status: 500,
        headers,
      });
    }
    if (resendKey === '') {
      return new Response(
        JSON.stringify({
          error:
            'RESEND_API_KEY ontbreekt. Stel deze in via `supabase secrets set RESEND_API_KEY=re_...`.',
        }),
        { status: 500, headers }
      );
    }

    // -- 1. Verifieer caller
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
    const callerId = callerData.user.id;

    // -- 2. Body parse
    const body = await req.json().catch(() => null);
    if (
      body === null ||
      typeof body !== 'object' ||
      !('expense_id' in body) ||
      typeof body.expense_id !== 'string'
    ) {
      return new Response(JSON.stringify({ error: 'Body must be { expense_id: string }' }), {
        status: 400,
        headers,
      });
    }
    const expenseId: string = body.expense_id;

    // -- 3. Service-role client voor cross-table lookups + storage-download
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: expense, error: expErr } = await adminClient
      .from('expenses')
      .select(
        'id, author_id, description, amount, currency, expense_type, receipt_path, submitted_at'
      )
      .eq('id', expenseId)
      .maybeSingle();
    if (expErr !== null || expense === null) {
      return new Response(
        JSON.stringify({ error: `Declaratie niet gevonden: ${expErr?.message ?? expenseId}` }),
        { status: 404, headers }
      );
    }
    const ex = expense as ExpenseInfo;

    // -- 4. Permissie: caller is eigenaar of admin
    const { data: callerAuthor } = await adminClient
      .from('authors')
      .select('is_admin')
      .eq('id', callerId)
      .maybeSingle();
    const isAdmin = callerAuthor?.is_admin === true;
    if (!isAdmin && callerId !== ex.author_id) {
      return new Response(JSON.stringify({ error: 'Not your expense' }), {
        status: 403,
        headers,
      });
    }

    // -- 5. Auteur-info ophalen voor nette mail-body
    const { data: author, error: authorErr } = await adminClient
      .from('authors')
      .select('id, email, first_name, last_name, netsuite_vendor_id')
      .eq('id', ex.author_id)
      .maybeSingle();
    if (authorErr !== null || author === null) {
      return new Response(
        JSON.stringify({
          error: `Auteur-info niet beschikbaar: ${authorErr?.message ?? ex.author_id}`,
        }),
        { status: 500, headers }
      );
    }
    const au = author as AuthorInfo;

    // -- 6. PDF downloaden uit storage en base64-encoderen
    const { data: pdfBlob, error: dlErr } = await adminClient.storage
      .from('expense-receipts')
      .download(ex.receipt_path);
    if (dlErr !== null || pdfBlob === null) {
      return new Response(
        JSON.stringify({ error: `PDF download faalde: ${dlErr?.message ?? 'unknown'}` }),
        { status: 500, headers }
      );
    }

    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);
    const filename = ex.receipt_path.split('/').pop() ?? 'declaratie.pdf';

    // -- 7. Mail samenstellen + via Resend versturen
    const typeLabel = ex.expense_type === 'idc' ? 'Projectkosten (IDC)' : 'Onkosten';
    const fullName = `${au.first_name} ${au.last_name}`.trim();
    const subject = `Nieuwe declaratie — ${typeLabel} — ${fullName}`;
    const html = buildMailHtml({
      authorName: fullName,
      authorEmail: au.email,
      vendorId: au.netsuite_vendor_id,
      typeLabel,
      description: ex.description,
      submittedAt: ex.submitted_at,
    });

    // Test-fase: MAIL_OVERRIDE_TO routeert alle uitgaande mail naar één
    // test-ontvanger. Subject krijgt prefix met het echte ontvangstadres
    // (hier `notifyTo`, normaliter rights@noordhoff.nl) zodat duidelijk
    // blijft wat de productie-route zou zijn geweest. Productie: secret
    // unset (`supabase secrets unset MAIL_OVERRIDE_TO`).
    const overrideTo = Deno.env.get('MAIL_OVERRIDE_TO');
    const finalTo = overrideTo !== undefined && overrideTo !== '' ? overrideTo : notifyTo;
    const finalSubject =
      overrideTo !== undefined && overrideTo !== '' ? `[TEST → ${notifyTo}] ${subject}` : subject;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: [finalTo],
        reply_to: au.email,
        subject: finalSubject,
        html,
        attachments: [
          {
            filename,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!resendResp.ok) {
      const detail = await resendResp.text();
      return new Response(
        JSON.stringify({
          error: `Resend ${String(resendResp.status)}: ${detail.slice(0, 500)}`,
        }),
        { status: 502, headers }
      );
    }

    // (Audit-log overgeslagen: de INSERT in `expenses` triggert al een
    // `expense_submitted`-rij via de audit-trigger uit migratie 0012.)

    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});

// =============================================================================
// Helpers
// =============================================================================
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  // btoa is beschikbaar in Deno-runtime
  return btoa(binary);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMailHtml(args: {
  authorName: string;
  authorEmail: string;
  vendorId: string | null;
  typeLabel: string;
  description: string;
  submittedAt: string;
}): string {
  const rows: [string, string][] = [
    ['Auteur', escapeHtml(args.authorName)],
    [
      'E-mail',
      `<a href="mailto:${escapeHtml(args.authorEmail)}">${escapeHtml(args.authorEmail)}</a>`,
    ],
  ];
  if (args.vendorId !== null) {
    rows.push(['Vendor ID', escapeHtml(args.vendorId)]);
  }
  rows.push(['Type', escapeHtml(args.typeLabel)]);
  rows.push(['Beschrijving', escapeHtml(args.description)]);
  rows.push(['Ingediend op', escapeHtml(args.submittedAt)]);

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb">${escapeHtml(label)}</td><td style="padding:6px 12px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb">${value}</td></tr>`
    )
    .join('');

  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111827">Nieuwe declaratie ingediend</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.5">
      Een auteur heeft via het auteursportaal een declaratie ingediend.
      De ingevulde PDF zit als bijlage bij deze mail. De gegevens hieronder
      komen rechtstreeks uit de portaal-database; controleer ze samen met
      de bijlage.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px">${rowsHtml}</table>
    <p style="margin:16px 0 0;color:#6b7280;font-size:12px">
      Verzonden namens het Noordhoff Auteursportaal — beantwoord deze mail
      direct om met de auteur in gesprek te gaan (reply-to is op de auteur
      gezet).
    </p>
  </div>
</body></html>`;
}
