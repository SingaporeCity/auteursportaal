/**
 * Supabase client — singleton voor de hele app.
 *
 * URL en anon key komen uit Vite env-vars (`VITE_SUPABASE_URL`,
 * `VITE_SUPABASE_ANON_KEY`). De anon key is bewust public-safe (JWT met
 * role=anon, beschermd door RLS-policies in de database). De service_role
 * key mag NOOIT in deze module of in de bundle terechtkomen — die is
 * exclusief voor lokale scripts en Edge Functions.
 *
 * @module lib/supabase
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/db';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (
  typeof supabaseUrl !== 'string' ||
  supabaseUrl.length === 0 ||
  typeof supabaseAnonKey !== 'string' ||
  supabaseAnonKey.length === 0
) {
  throw new Error(
    'Supabase env-vars ontbreken. Stel VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in via .env.'
  );
}

/**
 * Singleton Supabase-client. Importeer deze waar je queries doet.
 *
 * @example
 * import { supabase } from '@/lib/supabase';
 * const { data, error } = await supabase.from('payments').select('*');
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }
);
