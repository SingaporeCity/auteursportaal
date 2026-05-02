/**
 * Toegangscontrole voor het portaal.
 *
 * Twee rollen × twee modi:
 * - **Admin** — `is_admin = true`. Krijgt altijd `mode: 'full'`.
 * - **Auteur** met `onboarding_status = 'active'` → `mode: 'full'` (alle 7 tabs).
 * - **Auteur** met `pending_data` of `pending_admin_review` → `mode: 'onboarding'`
 *   (alleen profiel-tab actief, andere tabs disabled, banner bovenaan).
 *
 * Accounts zonder `authors`-record krijgen "geen toegang" en worden direct
 * uitgelogd. RLS is de echte beveiliging
 * (`supabase/migrations/0001_initial_schema.sql` + `0006_onboarding_status.sql`);
 * deze whitelist is UX-routing.
 *
 * @module auth/whitelist
 */

import type { Database } from '@/types/db';

export type AuthorRow = Database['public']['Tables']['authors']['Row'];

export type AccessRole = 'admin' | 'author';

/** Welke versie van het portaal de gebruiker te zien krijgt. */
export type AccessMode = 'full' | 'onboarding';

export interface AccessGranted {
  granted: true;
  role: AccessRole;
  mode: AccessMode;
  author: AuthorRow;
}

export interface AccessDenied {
  granted: false;
  reason: 'no_profile';
}

export type AccessDecision = AccessGranted | AccessDenied;

/**
 * Beslist of een ingelogde gebruiker toegang krijgt op basis van zijn
 * `authors`-record. Pure functie — geen Supabase-aanroepen, alleen logica.
 *
 * @param author De `authors`-row die hoort bij `auth.uid()`, of `null` als die niet bestaat.
 */
export function decideAccess(author: AuthorRow | null): AccessDecision {
  if (author === null) {
    return { granted: false, reason: 'no_profile' };
  }
  if (author.is_admin) {
    return { granted: true, role: 'admin', mode: 'full', author };
  }
  if (author.onboarding_status === 'active') {
    return { granted: true, role: 'author', mode: 'full', author };
  }
  // pending_data of pending_admin_review → onboarding-mode
  return { granted: true, role: 'author', mode: 'onboarding', author };
}
