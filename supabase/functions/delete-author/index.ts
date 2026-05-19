/**
 * Edge Function: delete-author
 *
 * Verwijdert een auteur volledig uit het portaal:
 *   1. Storage cleanup — recursief alle files onder `{authorId}/` in de
 *      buckets `statements`, `contracts`, `expense-receipts` (best-effort:
 *      bij faal loggen we de error en gaan door — de DB-delete daarna is
 *      de "harde" stap).
 *   2. DB delete — `authors.delete()` cascadet via FK-constraints naar
 *      `payments`, `contracts`, `forecasts`, `change_requests`, `expenses`,
 *      `login_history`. Audit-triggers op die child-tabellen schrijven
 *      automatisch per-rij audit-events (payment_deleted, etc.).
 *   3. Auth delete — `auth.admin.deleteUser(authorId)` verwijdert de
 *      Supabase-auth-user. Laatste stap zodat een gefaalde DB-delete niet
 *      eindigt met een onbruikbare auth-user.
 *   4. Audit log — top-level `author_deleted` row in `audit_actions` met
 *      naam/email in `before` zodat de audit-trail leesbaar blijft na de
 *      cascade.
 *
 * Body:
 *   { authorId: string }
 *
 * Response:
 *   200 { success: true, deleted: { storage_files: N, authors_row: true, auth_user: true } }
 *   400 { error: 'cannot_delete_self' | 'invalid_body' | 'author_not_found' }
 *   401 { error: 'no_authorization_header' | 'invalid_token' }
 *   403 { error: 'admin_access_required' }
 *   500 { error: 'server_error', message }
 *
 * Self-delete is expliciet geblokkeerd om te voorkomen dat de enige admin
 * zichzelf uitsluit. Wijziging admins moet via direct DB-acces.
 *
 * @module supabase/functions/delete-author
 */

// @ts-expect-error — Deno standard library, runtime resolution
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error — esm.sh runtime resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: { env: { get: (key: string) => string | undefined } };

const ALLOWED_ORIGINS = ['https://mijn-noordhoff.nl', 'http://localhost:5173'];
const STORAGE_BUCKETS = ['statements', 'contracts', 'expense-receipts'] as const;
const REMOVE_BATCH_SIZE = 100;

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

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (authHeader === null) {
      return new Response(JSON.stringify({ error: 'no_authorization_header' }), {
        status: 401,
        headers,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (supabaseUrl === '' || supabaseAnonKey === '' || supabaseServiceKey === '') {
      return new Response(JSON.stringify({ error: 'server_configuration_missing' }), {
        status: 500,
        headers,
      });
    }

    // -- 1. Verifieer aanroeper + admin-rechten
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401, headers });
    }

    const { data: callerAuthor } = await callerClient
      .from('authors')
      .select('is_admin')
      .eq('id', callerData.user.id)
      .maybeSingle();

    if (!callerAuthor?.is_admin) {
      return new Response(JSON.stringify({ error: 'admin_access_required' }), {
        status: 403,
        headers,
      });
    }

    // -- 2. Parse body
    const body = await req.json().catch(() => null);
    if (body === null || typeof body.authorId !== 'string' || body.authorId.length === 0) {
      return new Response(JSON.stringify({ error: 'invalid_body' }), { status: 400, headers });
    }
    const authorId: string = body.authorId;

    // -- 3. Self-delete blokkeren
    if (authorId === callerData.user.id) {
      return new Response(JSON.stringify({ error: 'cannot_delete_self' }), {
        status: 400,
        headers,
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // -- 4. Haal naam + email op voor audit-log (vóór de delete)
    const { data: targetAuthor, error: lookupErr } = await adminClient
      .from('authors')
      .select('email, first_name, last_name')
      .eq('id', authorId)
      .maybeSingle();

    if (lookupErr) {
      return new Response(JSON.stringify({ error: 'server_error', message: lookupErr.message }), {
        status: 500,
        headers,
      });
    }
    if (targetAuthor === null) {
      return new Response(JSON.stringify({ error: 'author_not_found' }), { status: 400, headers });
    }

    // -- 5. Storage cleanup (best-effort)
    let storageFilesRemoved = 0;
    const storageErrors: string[] = [];
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const paths = await listAllFiles(adminClient, bucket, authorId);
        if (paths.length === 0) continue;
        // Chunk-remove om limieten op `remove([])` te respecteren
        for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
          const chunk = paths.slice(i, i + REMOVE_BATCH_SIZE);
          const { error: rmErr } = await adminClient.storage.from(bucket).remove(chunk);
          if (rmErr) {
            storageErrors.push(`${bucket}: ${rmErr.message}`);
          } else {
            storageFilesRemoved += chunk.length;
          }
        }
      } catch (e) {
        storageErrors.push(`${bucket}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // -- 6. DB delete (CASCADE pakt children)
    const { error: delDbErr } = await adminClient.from('authors').delete().eq('id', authorId);
    if (delDbErr) {
      return new Response(
        JSON.stringify({
          error: 'server_error',
          message: `db_delete_failed: ${delDbErr.message}`,
          storage_errors: storageErrors,
        }),
        { status: 500, headers }
      );
    }

    // -- 7. Auth delete
    let authUserDeleted = false;
    let authError: string | null = null;
    const { error: delAuthErr } = await adminClient.auth.admin.deleteUser(authorId);
    if (delAuthErr === null || delAuthErr === undefined) {
      authUserDeleted = true;
    } else {
      authError = delAuthErr.message;
    }

    // -- 8. Audit log (top-level event; cascade-triggers loggen de kinderen)
    await adminClient.from('audit_actions').insert({
      action_type: 'author_deleted',
      actor_id: callerData.user.id,
      target_table: 'authors',
      target_id: authorId,
      before: {
        email: targetAuthor.email,
        first_name: targetAuthor.first_name,
        last_name: targetAuthor.last_name,
      },
      metadata: {
        storage_files_removed: storageFilesRemoved,
        storage_errors: storageErrors.length > 0 ? storageErrors : undefined,
        auth_user_deleted: authUserDeleted,
        auth_error: authError,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        deleted: {
          storage_files: storageFilesRemoved,
          authors_row: true,
          auth_user: authUserDeleted,
        },
        warnings:
          storageErrors.length > 0 || authError !== null
            ? { storage_errors: storageErrors, auth_error: authError }
            : undefined,
      }),
      { status: 200, headers }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        message: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers }
    );
  }
});

/**
 * Recursieve list van alle bestandspaden onder `prefix` in `bucket`.
 * Supabase storage-API returnt folders met `id === null`; we doorlopen
 * met BFS zodat we niet vastlopen op diepe geneste paden (zoals
 * `statements/{authorId}/{type}/{year}/file.pdf`).
 */
async function listAllFiles(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const collected: string[] = [];
  const queue: string[] = [prefix];
  // Hard cap om eindeloze loops (broken metadata) af te dekken
  const MAX_ITER = 5000;
  let iter = 0;
  while (queue.length > 0 && iter < MAX_ITER) {
    iter++;
    const current = queue.shift() ?? '';
    const { data, error } = await adminClient.storage.from(bucket).list(current, { limit: 1000 });
    if (error || !data) continue;
    for (const entry of data) {
      const fullPath = current === '' ? entry.name : `${current}/${entry.name}`;
      if (entry.id === null) {
        queue.push(fullPath);
      } else {
        collected.push(fullPath);
      }
    }
  }
  return collected;
}
