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
        ? [{ author_id: body.author_id, email: body.email }]
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

async function sendRecoveryEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  // Kill-switch (test-fase): bij DISABLE_AUTH_EMAILS=true verstuurt geen
  // enkele invite/recovery-mail vanuit deze Edge Function. De caller flow
  // (invited_at zetten, status-updates) blijft draaien alsof het wel
  // verstuurd is — handig om het portaal te testen zonder dat testauteurs
  // mails ontvangen. Zet de secret uit zodra mail-deliverability live mag:
  //   supabase secrets unset DISABLE_AUTH_EMAILS
  if (Deno.env.get('DISABLE_AUTH_EMAILS') === 'true') {
    return { ok: true };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `recover endpoint ${String(response.status)}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function ensureAuthUser(
  adminClient: ReturnType<typeof createClient>,
  author_id: string,
  email: string
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  // Check existing
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existing = existingUsers?.users?.find(
    (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    return { ok: true, created: false };
  }

  const randomPassword = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await adminClient.auth.admin.createUser({
    id: author_id,
    email,
    password: randomPassword,
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
  { author_id, email }: ActivateInput,
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
    const ensure = await ensureAuthUser(adminClient, author_id, email);
    if (!ensure.ok) {
      return { author_id, email, status: 'failed', error: ensure.error };
    }

    // Mail-policy:
    //  - mode='invite' → altijd sturen (de mail IS het doel van de invite)
    //  - mode='activate' + nieuwe auth-user → sturen (nieuwe user moet password instellen)
    //  - mode='activate' + bestaande auth-user → NIET sturen (user heeft al password,
    //    extra mail verwart + verbrandt onnodig de Supabase email-rate-limit)
    const shouldSendMail = mode === 'invite' || ensure.created;
    if (shouldSendMail) {
      const sent = await sendRecoveryEmail(email);
      if (!sent.ok) {
        return {
          author_id,
          email,
          status: 'failed',
          error: `Auth user OK but recovery mail failed: ${sent.error}`,
        };
      }
    }

    // Mode-specifieke side-effects
    if (mode === 'invite') {
      // Bepaal of dit een eerste invite of reminder is
      const { data: row } = await adminClient
        .from('authors')
        .select('invited_at')
        .eq('id', author_id)
        .maybeSingle();

      const isReminder = row?.invited_at !== null && row?.invited_at !== undefined;
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
    // DB-trigger zet activated_at automatisch + sync_is_active_with_status zet is_active=true
    const { error: actErr } = await adminClient
      .from('authors')
      .update({ onboarding_status: 'active' })
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
