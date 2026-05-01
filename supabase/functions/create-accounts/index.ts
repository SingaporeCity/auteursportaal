/**
 * Edge Function: create-accounts
 *
 * Activeert een auteur die door de admin is aangemaakt:
 *   1. Verifieert dat de aanroeper een admin is (via JWT)
 *   2. Maakt een Supabase auth-user aan met dezelfde UUID als het authors-record
 *   3. Stuurt een password-recovery email zodat de auteur een wachtwoord kan instellen
 *   4. Zet authors.is_active = true en authors.activated_at = now()
 *
 * Body shapes (beide ondersteund):
 *   { author_id: string, email: string }                       — single (nieuwe flow)
 *   { accounts: Array<{ author_id: string, email: string }> }  — bulk (legacy)
 *
 * @module supabase/functions/create-accounts
 */

// @ts-expect-error — Deno standard library, runtime resolution
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

const ALLOWED_ORIGINS = [
  'https://mijn-noordhoff.nl',
  'https://singaporecity.github.io',
  'http://localhost:5173',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin !== null && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

interface ActivateInput {
  author_id: string;
  email: string;
}

interface ActivateResult {
  author_id: string;
  email: string;
  status: 'activated' | 'already_active' | 'failed';
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

    // -- 1. Verify caller is admin (via own JWT)
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

    // -- 2. Parse request body (accept single or bulk)
    const body = await req.json().catch(() => null);
    if (body === null) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers,
      });
    }

    const inputs: ActivateInput[] = Array.isArray(body.accounts)
      ? body.accounts
      : typeof body.author_id === 'string' && typeof body.email === 'string'
        ? [{ author_id: body.author_id, email: body.email }]
        : [];

    if (inputs.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Body must be { author_id, email } or { accounts: [...] }',
        }),
        { status: 400, headers }
      );
    }

    // -- 3. Process each
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const results: ActivateResult[] = [];

    for (const input of inputs) {
      results.push(await activateOne(adminClient, input));
    }

    return new Response(JSON.stringify({ results }), { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers });
  }
});

async function sendRecoveryEmail(email: string): Promise<{ ok: boolean; error?: string }> {
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

async function activateOne(
  adminClient: ReturnType<typeof createClient>,
  { author_id, email }: ActivateInput
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
    // Check of auth user al bestaat
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existing = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      // Auth user bestaat. Markeer als active als nog niet, en stuur opnieuw recovery
      await adminClient
        .from('authors')
        .update({ is_active: true, activated_at: new Date().toISOString() })
        .eq('id', author_id);

      const sent = await sendRecoveryEmail(email);
      if (!sent.ok) {
        return { author_id, email, status: 'failed', error: sent.error };
      }
      return { author_id, email, status: 'already_active' };
    }

    // Nieuwe user aanmaken met auteur-UUID
    const randomPassword = crypto.randomUUID() + crypto.randomUUID();
    const { error: createError } = await adminClient.auth.admin.createUser({
      id: author_id,
      email,
      password: randomPassword,
      email_confirm: true,
    });

    if (createError) {
      return {
        author_id,
        email,
        status: 'failed',
        error: createError.message,
      };
    }

    // Stuur recovery-mail via /auth/v1/recover REST endpoint — dezelfde route
    // die het Supabase Dashboard gebruikt voor "Send password recovery", en
    // robuuster dan auth.admin.generateLink() dat soms geen mail stuurt.
    const sent = await sendRecoveryEmail(email);
    if (!sent.ok) {
      return {
        author_id,
        email,
        status: 'failed',
        error: `Auth user created but recovery mail failed: ${sent.error}`,
      };
    }

    // Markeer auteur als geactiveerd
    const { error: updateError } = await adminClient
      .from('authors')
      .update({ is_active: true, activated_at: new Date().toISOString() })
      .eq('id', author_id);

    if (updateError) {
      return {
        author_id,
        email,
        status: 'failed',
        error: `Activation flag update failed: ${updateError.message}`,
      };
    }

    return { author_id, email, status: 'activated' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { author_id, email, status: 'failed', error: message };
  }
}
