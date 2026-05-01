/**
 * Email + password authenticatie-flow.
 *
 * Wordt gebruikt door:
 * - Auteurs (altijd; hun standaard-flow met activate-mail).
 * - Admin als fallback zolang `VITE_ADMIN_SSO_ENABLED=false` (zie `sso.ts`).
 *
 * Wachtwoord-reset gaat altijd via Supabase recovery-emails. Auteurs krijgen
 * deze mail bij activatie via de admin-UI; bestaande accounts kunnen op
 * "wachtwoord vergeten" klikken om een nieuwe link aan te vragen.
 *
 * @module auth/password
 */

import { supabase } from '@/lib/supabase';

export interface SignInResult {
  success: boolean;
  error?: 'invalid_credentials' | 'network' | 'unknown';
}

export interface SetPasswordResult {
  success: boolean;
  error?: 'too_short' | 'no_recovery_session' | 'network' | 'unknown';
}

const MIN_PASSWORD_LENGTH = 12;

/**
 * Logt in met email + password. Geeft `success: false` met type-classified
 * error terug i.p.v. te throwen, zodat de UI nette foutmeldingen kan tonen.
 */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error === null) {
    return { success: true };
  }

  if (error.message.toLowerCase().includes('invalid login credentials')) {
    return { success: false, error: 'invalid_credentials' };
  }
  if (error.message.toLowerCase().includes('fetch')) {
    return { success: false, error: 'network' };
  }
  return { success: false, error: 'unknown' };
}

/**
 * Vraagt een password-reset email aan. Stuurt de gebruiker via email-link
 * terug naar `/auth/set-password` op de huidige host.
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/set-password`,
  });
  return { success: error === null };
}

/**
 * Stelt een nieuw wachtwoord in. Vereist dat de gebruiker een actieve
 * recovery-sessie heeft (= heeft net op de mail-link geklikt).
 *
 * Minimum-lengte (12 tekens) is een security-baseline; OWASP raadt 12+ aan
 * voor accounts zonder MFA, en SSO is hier (nog) niet beschikbaar voor auteurs.
 */
export async function setNewPassword(newPassword: string): Promise<SetPasswordResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { success: false, error: 'too_short' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session === null) {
    return { success: false, error: 'no_recovery_session' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error === null) {
    return { success: true };
  }
  if (error.message.toLowerCase().includes('fetch')) {
    return { success: false, error: 'network' };
  }
  return { success: false, error: 'unknown' };
}

export const PASSWORD_MIN_LENGTH = MIN_PASSWORD_LENGTH;
