/**
 * Edge Function: create-accounts
 *
 * Twee modi (vanaf iter 4):
 *
 *   mode='invite' — voor `pending_data` rijen:
 *     1. Verifieer dat de aanroeper een admin is (via JWT)
 *     2. Maak Supabase auth-user met dezelfde UUID als het authors-record
 *        (alleen als nog niet bestaat)
 *     3. Stuur recovery-mail zodat auteur wachtwoord kan instellen + inloggen
 *     4. Zet `authors.invited_at = now()`. STATUS BLIJFT pending_data —
 *        auteur vult eigen profiel aan + klikt "Activeer mijn account".
 *     5. Indien `reminder_sent_at` al ingevuld: dit is een reminder-call,
 *        update `reminder_sent_at` ipv `invited_at`.
 *
 *   mode='activate' (default — backward-compat):
 *     1. Verifieer dat de aanroeper een admin is
 *     2. Maak auth-user als die nog niet bestaat
 *     3. Stuur recovery-mail ALLEEN als auth-user net is aangemaakt
 *        (bestaande users hebben al een password — extra mail is verwarrend
 *        + verbrandt onnodig de Supabase email-rate-limit)
 *     4. Zet `authors.onboarding_status='active'` (DB-trigger zet activated_at)
 *
 * Body shapes:
 *   { author_id, email, mode? }                       — single
 *   { accounts: [...], mode? }                        — bulk
 *
 * @module supabase/functions/create-accounts
 */

// @ts-expect-error — Deno standard library, runtime resolution
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

// CORS-whitelist (audit H11). Productie-domein + lokale dev-server.
// `singaporecity.github.io` (oude demo) is verwijderd — daar draait niets meer.
// Na DNS-cutover van mijn-noordhoff.nl: overweeg ook `localhost:5173` te
// verwijderen en alleen via env-var ALLOWED_ORIGINS te overrulen voor dev.
const ALLOWED_ORIGINS = ['https://mijn-noordhoff.nl', 'http://localhost:5173'];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin !== null && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

type Mode = 'invite' | 'activate';

interface ActivateInput {
  author_id: string;
  email: string;
  /**
   * Optioneel start-wachtwoord voor nieuwe auth-users. Tijdens de test-fase
   * gebruikt de admin-UI hier 'Noordhoff'; bij ontbreken valt ensureAuthUser
   * terug op een random 64-char password (oude gedrag).
   */
  password?: string;
}

interface ActivateResult {
  author_id: string;
  email: string;
  status: 'invited' | 'activated' | 'reminder_sent' | 'already_active' | 'failed';
  error?: string;
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

    if (supabaseUrl === '' || supabaseAnonKey === '' || supabaseServiceKey === '') {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }), {
        status: 500,
        headers,
      });
    }

    // -- 1. Verify caller is admin
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) {
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

    // -- 1b. Rate-limit (audit-finding H10): 60 calls/uur per admin.
    // Genoeg voor normale onboarding-bursts; blokkeert mass-invite-misbruik.
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: rateOk, error: rateErr } = await adminClient.rpc('check_rate_limit', {
      p_actor: callerData.user.id,
      p_action: 'create_accounts',
      p_max: 60,
      p_window_seconds: 3600,
    });
    if (rateErr || rateOk !== true) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Probeer over een uur opnieuw.' }),
        { status: 429, headers }
      );
    }

    // -- 2. Parse body
    const body = await req.json().catch(() => null);
    if (body === null) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers,
      });
    }

    const mode: Mode = body.mode === 'invite' ? 'invite' : 'activate';

    const inputs: ActivateInput[] = Array.isArray(body.accounts)
      ? body.accounts
      : typeof body.author_id === 'string' && typeof body.email === 'string'
        ? [
            {
              author_id: body.author_id,
              email: body.email,
              password: typeof body.password === 'string' ? body.password : undefined,
            },
          ]
        : [];

    if (inputs.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Body must be { author_id, email, mode? } or { accounts: [...], mode? }',
        }),
        { status: 400, headers }
      );
    }

    // -- 3. Process (adminClient hergebruikt vanuit rate-limit-stap)
    const actorId = callerData.user.id;
    const results: ActivateResult[] = [];

    for (const input of inputs) {
      results.push(await processOne(adminClient, input, mode, actorId));
    }

    return new Response(JSON.stringify({ results }), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});

/**
 * Verstuurt een welkomst- of activatiemail via Resend.
 *
 * - `mode='invite'`: nieuwe auteur is net aangemaakt door de admin. Mail
 *   bevat de inloggegevens (initieel wachtwoord 'Noordhoff'). Auteur logt
 *   in op een **inactief** account, vult zijn persoonsgegevens aan en
 *   klikt "Verzend gegevens". GEEN wachtwoord-wijzigen-prompt — die komt
 *   pas bij login op een actief account.
 *
 * - `mode='activate'`: admin heeft de auteur zojuist geactiveerd. Mail
 *   bevat dezelfde inloggegevens. Bij eerste login op het nu-actieve
 *   account wordt het wachtwoord verplicht gewijzigd en 2FA enrolled.
 *
 * Kill-switch (test-fase): bij `DISABLE_AUTH_EMAILS=true` wordt geen
 * mail verzonden; functie geeft `ok` terug zodat de rest van de flow
 * (invited_at, status-updates) blijft draaien. Productie: zet de secret
 * uit (`supabase secrets unset DISABLE_AUTH_EMAILS`).
 */
async function sendAccountMail(args: {
  email: string;
  first_name: string;
  last_name: string;
  mode: Mode;
}): Promise<{ ok: boolean; error?: string }> {
  if (Deno.env.get('DISABLE_AUTH_EMAILS') === 'true') {
    return { ok: true };
  }

  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  if (resendKey === '') {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const from = Deno.env.get('ACCOUNT_MAIL_FROM') ?? 'Noordhoff <onboarding@resend.dev>';
  const portalUrl = Deno.env.get('PORTAL_URL') ?? 'https://mijn-noordhoff.nl';
  const firstName = args.first_name.trim();

  const { subject, html } =
    args.mode === 'invite'
      ? renderInviteMail({ firstName, email: args.email, portalUrl })
      : renderActivateMail({ firstName, email: args.email, portalUrl });

  // Test-fase: alle mails naar één adres routeren (MAIL_OVERRIDE_TO). Het
  // originele bestemmingsadres komt in de subject-prefix zodat duidelijk
  // blijft voor wie de mail eigenlijk bedoeld was. Productie: secret unset.
  const overrideTo = Deno.env.get('MAIL_OVERRIDE_TO');
  const finalTo = overrideTo !== undefined && overrideTo !== '' ? [overrideTo] : [args.email];
  const finalSubject =
    overrideTo !== undefined && overrideTo !== '' ? `[TEST → ${args.email}] ${subject}` : subject;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: finalTo, subject: finalSubject, html }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `Resend ${String(resp.status)}: ${text.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* =============================================================================
 * Mail-templates
 *
 * Twee branded mails (welkomst + activatie). Beide gebruiken `mailLayout`
 * voor logo + container + footer; `ctaButton` voor de teal-knop en
 * `infoTile` voor het inloggegevens-blok.
 * ============================================================================= */

const BRAND_TEAL = '#007460';
const BRAND_TEAL_DARK = '#005a49';
const BG_SUBTLE = '#f7f8fa';
const BORDER = '#e5e7eb';
const TEXT = '#1a1a1a';
const TEXT_MUTED = '#6b7280';

function mailLayout(opts: { logoUrl: string; preheader: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="nl"><body style="margin:0;padding:24px 12px;background:${BG_SUBTLE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeText(opts.preheader)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
    <tr><td style="padding:28px 32px 8px 32px;text-align:left;">
      <img src="${opts.logoUrl}" alt="Noordhoff" height="32" style="display:block;height:32px;width:auto;border:0;outline:none;text-decoration:none;" />
    </td></tr>
    <tr><td style="padding:8px 32px 28px 32px;color:${TEXT};font-size:15px;line-height:1.6;">
      ${opts.bodyHtml}
    </td></tr>
    <tr><td style="padding:20px 32px 24px 32px;border-top:1px solid ${BORDER};background:${BG_SUBTLE};color:${TEXT_MUTED};font-size:12px;line-height:1.55;">
      Vragen of opmerkingen? Mail naar <a href="mailto:rights@noordhoff.nl" style="color:${BRAND_TEAL};text-decoration:none;">rights@noordhoff.nl</a>.<br />
      Met vriendelijke groet, <strong style="color:${TEXT};">Noordhoff</strong>
    </td></tr>
  </table>
</body></html>`;
}

function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:6px;background:${BRAND_TEAL};">
    <a href="${href}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.01em;border-radius:6px;background:${BRAND_TEAL};">${escapeText(label)}</a>
  </td></tr></table>`;
}

function infoTile(rows: { label: string; value: string; valueHref?: string }[]): string {
  const inner = rows
    .map((r) => {
      const valueHtml =
        r.valueHref !== undefined
          ? `<a href="${r.valueHref}" style="color:${BRAND_TEAL_DARK};text-decoration:none;">${escapeText(r.value)}</a>`
          : escapeText(r.value);
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;">
        <span style="color:${TEXT_MUTED};font-size:13px;">${escapeText(r.label)}</span>
        <span style="color:${TEXT};font-size:14px;font-weight:600;text-align:right;">${valueHtml}</span>
      </div>`;
    })
    .join('');
  return `<div style="background:${BG_SUBTLE};border:1px solid ${BORDER};border-radius:8px;padding:14px 18px;margin:18px 0;">${inner}</div>`;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function greetingFor(firstName: string): string {
  return firstName === '' ? 'Beste auteur' : `Beste ${escapeText(firstName)}`;
}

/** Welkomstmail — nieuwe auteur is net aangemaakt. Enthousiaste introductie
 *  van het portaal, met een heldere drie-staps-flow: eerst gegevens
 *  aanvullen, dan activeert Noordhoff het account, dan kan auteur zijn
 *  statements en contracten inzien. */
function renderInviteMail(args: { firstName: string; email: string; portalUrl: string }): {
  subject: string;
  html: string;
} {
  const logoUrl = `${args.portalUrl}/noordhoff-logo.png`;
  const body = `
    <h1 style="margin:8px 0 16px 0;font-size:22px;line-height:1.25;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Welkom in het Noordhoff Auteursportaal</h1>
    <p style="margin:0 0 14px 0;">${greetingFor(args.firstName)},</p>
    <p style="margin:0 0 14px 0;">Wat fijn dat u uw nieuwe Auteursportaal in gebruik gaat nemen! Vanaf nu vindt u uw royaltystatements, contracten en declaraties allemaal op één centrale, beveiligde plek. Geen losse mails of papieren overzichten meer; alles overzichtelijk in één omgeving.</p>
    <p style="margin:0 0 10px 0;">Om uw portaal in gebruik te nemen doorlopen we samen drie stappen:</p>
    <ol style="margin:0 0 16px 22px;padding:0;color:${TEXT};">
      <li style="margin-bottom:6px;"><strong>U logt in</strong> met onderstaande gegevens en vult uw persoonsgegevens aan op uw profielpagina.</li>
      <li style="margin-bottom:6px;"><strong>Wij activeren uw account</strong> zodra uw gegevens compleet zijn. Dit gebeurt meestal binnen enkele werkdagen.</li>
      <li><strong>U krijgt volledige toegang</strong> tot uw royaltystatements, contracten, forecasts en declaratiefunctie. U ontvangt hierover nog een aparte bevestiging.</li>
    </ol>
    ${infoTile([
      { label: 'Inloggen', value: args.portalUrl, valueHref: args.portalUrl },
      { label: 'E-mailadres', value: args.email },
      { label: 'Wachtwoord', value: 'Noordhoff' },
    ])}
    <p style="margin:0 0 8px 0;color:${TEXT_MUTED};font-size:13px;">Bij uw eerste inlog vragen wij u nog niet om uw wachtwoord te wijzigen. Dat komt pas zodra uw account actief is.</p>
    ${ctaButton('Log in op het portaal', args.portalUrl)}
  `;
  return {
    subject: 'Welkom in het Noordhoff Auteursportaal',
    html: mailLayout({
      logoUrl,
      preheader: 'Uw account staat klaar. Log in om uw persoonsgegevens aan te vullen.',
      bodyHtml: body,
    }),
  };
}

/** Activatiemail — admin heeft het account zojuist geactiveerd. Het portaal
 *  is nu volledig beschikbaar; korte opsomming van wat de auteur kan doen
 *  en een directe CTA om in te loggen. */
function renderActivateMail(args: { firstName: string; email: string; portalUrl: string }): {
  subject: string;
  html: string;
} {
  const logoUrl = `${args.portalUrl}/noordhoff-logo.png`;
  const body = `
    <h1 style="margin:8px 0 16px 0;font-size:22px;line-height:1.25;font-weight:700;color:${TEXT};letter-spacing:-0.01em;">Uw portaal is nu beschikbaar</h1>
    <p style="margin:0 0 14px 0;">${greetingFor(args.firstName)},</p>
    <p style="margin:0 0 14px 0;">Goed nieuws: uw account is zojuist geactiveerd. Het volledige Auteursportaal staat vanaf nu voor u open. U kunt op elk moment inloggen om:</p>
    <ul style="margin:0 0 18px 22px;padding:0;color:${TEXT};">
      <li style="margin-bottom:6px;">uw royaltystatements te bekijken en te downloaden;</li>
      <li style="margin-bottom:6px;">uw contracten met Noordhoff in te zien;</li>
      <li style="margin-bottom:6px;">onkosten en projectkosten te declareren;</li>
      <li>uw forecasts te raadplegen.</li>
    </ul>
    ${infoTile([
      { label: 'Inloggen', value: args.portalUrl, valueHref: args.portalUrl },
      { label: 'E-mailadres', value: args.email },
      { label: 'Wachtwoord', value: 'Noordhoff' },
    ])}
    <p style="margin:0 0 8px 0;color:${TEXT_MUTED};font-size:13px;">Bij uw eerste inlog kiest u een eigen wachtwoord en stelt u twee-staps-verificatie in. Daarna is uw account volledig beveiligd.</p>
    ${ctaButton('Open mijn portaal', args.portalUrl)}
  `;
  return {
    subject: 'Uw Noordhoff Auteursportaal is nu beschikbaar',
    html: mailLayout({
      logoUrl,
      preheader:
        'Uw account is geactiveerd. Open uw portaal en bekijk uw statements en contracten.',
      bodyHtml: body,
    }),
  };
}

async function ensureAuthUser(
  adminClient: ReturnType<typeof createClient>,
  author_id: string,
  email: string,
  password?: string
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  // Check existing
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(
    (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    return { ok: true, created: false };
  }

  // Wachtwoord-keuze: caller mag een vast start-wachtwoord meegeven (test-fase
  // 'Noordhoff' — auteur wordt bij eerste login geforceerd te wijzigen).
  // Zonder caller-input val terug op random 64-char password (oude gedrag,
  // dwingt invite-mail-flow af).
  const effectivePassword = password ?? crypto.randomUUID() + crypto.randomUUID();
  const { error } = await adminClient.auth.admin.createUser({
    id: author_id,
    email,
    password: effectivePassword,
    email_confirm: true,
  });
  if (error) {
    return { ok: false, created: false, error: error.message };
  }
  return { ok: true, created: true };
}

async function logAudit(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  actionType: 'author_invited' | 'author_reminded',
  authorId: string,
  email: string
): Promise<void> {
  // Best-effort — als audit-log faalt, blokkeren we niet de hoofdactie.
  // De hoofdtransactie (mail + status-update) is leidend; een gemiste
  // audit-row is acceptabeler dan een geblokkeerde invite.
  try {
    await adminClient.from('audit_actions').insert({
      action_type: actionType,
      actor_id: actorId,
      target_table: 'authors',
      target_id: authorId,
      metadata: { email, source: 'create-accounts' },
    });
  } catch {
    // swallow — audit-failure mag main-flow niet stoppen
  }
}

async function processOne(
  adminClient: ReturnType<typeof createClient>,
  { author_id, email, password }: ActivateInput,
  mode: Mode,
  actorId: string
): Promise<ActivateResult> {
  if (!author_id || !email) {
    return {
      author_id: author_id ?? 'unknown',
      email: email ?? '',
      status: 'failed',
      error: 'Missing author_id or email',
    };
  }

  try {
    // Maak/check auth-user (in beide modi nodig)
    const ensure = await ensureAuthUser(adminClient, author_id, email, password);
    if (!ensure.ok) {
      return { author_id, email, status: 'failed', error: ensure.error };
    }

    // Auteur-data ophalen voor de mail-template (first/last name) en om
    // te bepalen of dit een eerste invite of reminder is.
    const { data: authorRow } = await adminClient
      .from('authors')
      .select('first_name, last_name, invited_at')
      .eq('id', author_id)
      .maybeSingle();

    const firstName = (authorRow?.first_name as string | null) ?? '';
    const lastName = (authorRow?.last_name as string | null) ?? '';

    // Welkomst- of activatiemail versturen. In test-fase houdt
    // DISABLE_AUTH_EMAILS=true de daadwerkelijke verzending stil.
    // mode='invite' → welkomstmail (ook bij reminder — dezelfde inhoud).
    // mode='activate' → activatiemail (altijd).
    const sent = await sendAccountMail({
      email,
      first_name: firstName,
      last_name: lastName,
      mode,
    });
    if (!sent.ok) {
      // Rollback bij mail-fail in invite-mode wanneer de auth-user net is
      // aangemaakt: anders blijft er een orphaned auth-user achter zonder
      // dat de auteur de inloggegevens heeft ontvangen. De aanroeper
      // (admin-UI) ruimt vervolgens zelf de authors-rij op. Voor
      // mode='activate' geen rollback — daar bestond de auteur al en is
      // een gemiste mail een soft fout (admin kan opnieuw klikken).
      let rolledBack = false;
      if (mode === 'invite' && ensure.created) {
        const { error: delErr } = await adminClient.auth.admin.deleteUser(author_id);
        if (delErr === null || delErr === undefined) {
          rolledBack = true;
        }
      }
      return {
        author_id,
        email,
        status: 'failed',
        error: rolledBack
          ? `Mail-verzending mislukt: ${sent.error}. Account is opgeruimd; controleer mail-configuratie en probeer opnieuw.`
          : `Mail-verzending mislukt: ${sent.error}`,
      };
    }

    // Mode-specifieke side-effects
    if (mode === 'invite') {
      const isReminder = authorRow?.invited_at !== null && authorRow?.invited_at !== undefined;
      const updateField = isReminder
        ? { reminder_sent_at: new Date().toISOString() }
        : { invited_at: new Date().toISOString() };

      const { error: updErr } = await adminClient
        .from('authors')
        .update(updateField)
        .eq('id', author_id);

      if (updErr) {
        return {
          author_id,
          email,
          status: 'failed',
          error: `Status field update failed: ${updErr.message}`,
        };
      }

      // Audit-log (H9/M10): invited_at/reminder_sent_at zijn niet in de
      // monitored-set van de authors-trigger, dus deze events komen alleen
      // via Edge Function-instrumentatie in audit_actions terecht.
      await logAudit(
        adminClient,
        actorId,
        isReminder ? 'author_reminded' : 'author_invited',
        author_id,
        email
      );

      return {
        author_id,
        email,
        status: isReminder ? 'reminder_sent' : 'invited',
      };
    }

    // mode === 'activate'
    // - onboarding_status='active' → DB-trigger zet activated_at + sync_is_active_with_status
    // - must_change_password=true → bij eerste login op het actieve account
    //   wordt het wachtwoord verplicht gewijzigd. Tijdens onboarding (inactief)
    //   krijgt de auteur deze prompt bewust NIET.
    const { error: actErr } = await adminClient
      .from('authors')
      .update({ onboarding_status: 'active', must_change_password: true })
      .eq('id', author_id);

    if (actErr) {
      return {
        author_id,
        email,
        status: 'failed',
        error: `Activation update failed: ${actErr.message}`,
      };
    }

    return {
      author_id,
      email,
      status: ensure.created ? 'activated' : 'already_active',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { author_id, email, status: 'failed', error: message };
  }
}
