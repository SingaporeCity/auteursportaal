/**
 * Toegangscontrole voor het portaal.
 *
 * Twee rollen:
 * - **Admin** — `is_admin = true` op de `authors`-record. Logt in via SSO
 *   (Microsoft Entra ID, achter `VITE_ADMIN_SSO_ENABLED`) of email+password
 *   (fallback zolang SSO nog niet geconfigureerd is).
 * - **Auteur** — `is_admin = false` AND `is_active = true`. Wordt door de
 *   admin aangemaakt + geactiveerd; logt daarna in via email+password met
 *   recovery-link.
 *
 * Niet-geactiveerde auteurs en accounts zonder `authors`-record krijgen
 * "geen toegang" en worden direct uitgelogd. RLS is de echte beveiliging
 * (zie `supabase/migrations/0001_initial_schema.sql`); deze whitelist is UX.
 *
 * @module auth/whitelist
 */

import type { Database } from '@/types/db';

export type AuthorRow = Database['public']['Tables']['authors']['Row'];

export type AccessRole = 'admin' | 'author';

export interface AccessGranted {
  granted: true;
  role: AccessRole;
  author: AuthorRow;
}

export interface AccessDenied {
  granted: false;
  reason: 'no_profile' | 'not_active';
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
    return { granted: true, role: 'admin', author };
  }
  if (author.is_active) {
    return { granted: true, role: 'author', author };
  }
  return { granted: false, reason: 'not_active' };
}
