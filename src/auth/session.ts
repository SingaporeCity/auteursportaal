/**
 * Sessie-management: ophalen actieve sessie, profiel laden, uitloggen,
 * en luisteren naar auth-state-changes.
 *
 * Gebruikt de Supabase singleton uit `src/lib/supabase.ts`.
 *
 * @module auth/session
 */

import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { decideAccess, type AccessDecision, type AuthorRow } from './whitelist';

/**
 * Haalt de actieve sessie op (uit localStorage of cookies). Retourneert
 * `null` als er geen sessie is of als de tokens ongeldig zijn.
 */
export async function getActiveSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error !== null) {
    return null;
  }
  return data.session;
}

/**
 * Haalt het `authors`-profiel op voor de ingelogde gebruiker.
 * Werkt mits er een geldige sessie is (RLS geeft anders 0 rijen).
 */
export async function loadOwnProfile(): Promise<AuthorRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userId === undefined) {
    return null;
  }

  const { data, error } = await supabase.from('authors').select('*').eq('id', userId).maybeSingle();

  if (error !== null) {
    return null;
  }
  return data;
}

/**
 * Combineert sessie-check + profiel-load + whitelist-beslissing in één
 * aanroep voor app-boot.
 */
export async function restoreSession(): Promise<AccessDecision | null> {
  const session = await getActiveSession();
  if (session === null) {
    return null;
  }
  const profile = await loadOwnProfile();
  return decideAccess(profile);
}

/**
 * Logt de huidige gebruiker uit en wist alle tokens uit `localStorage`.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Registreert een listener voor SIGNED_IN / SIGNED_OUT / PASSWORD_RECOVERY
 * events. Gebruikt door de router om op auth-changes te reageren.
 *
 * @returns Unsubscribe-functie. Roep aan in cleanup.
 */
export function onAuthStateChange(
  handler: (event: AuthStateEvent, session: Session | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (
      event === 'SIGNED_IN' ||
      event === 'SIGNED_OUT' ||
      event === 'PASSWORD_RECOVERY' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED'
    ) {
      handler(event, session);
    }
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export type AuthStateEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'PASSWORD_RECOVERY'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';
