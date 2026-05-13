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

/**
 * Minimum-lengte voor zelfgekozen wachtwoorden. Default 12 (OWASP-baseline
 * voor accounts zonder MFA). Tijdens test-fase kan dit verlaagd worden via
 * `VITE_PASSWORD_MIN_LENGTH=6` zodat testers niet hoeven uit te wijken naar
 * een wachtwoordmanager. Waardes buiten [1, 128] worden genegeerd.
 */
const ENV_MIN_PASSWORD_LENGTH = Number(import.meta.env.VITE_PASSWORD_MIN_LENGTH);
const MIN_PASSWORD_LENGTH =
  Number.isFinite(ENV_MIN_PASSWORD_LENGTH) &&
  ENV_MIN_PASSWORD_LENGTH >= 1 &&
  ENV_MIN_PASSWORD_LENGTH <= 128
    ? ENV_MIN_PASSWORD_LENGTH
    : 12;

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
 *
 * Beveiliging (audit-finding M3): retourneert ALTIJD `{success: true}` —
 * ook als het email-adres niet bestaat of de Supabase-call faalt. Anders kan
 * een aanvaller via het verschil in respons emails enumereren ("Joe@x.nl
 * heeft een account, John@x.nl niet"). De UI toont uniform "Als het adres
 * bekend is, ontvangt u een mail." Echte fouten worden alleen naar de
 * dev-debug-panel gerapporteerd, niet naar de gebruiker.
 */
export async function requestPasswordReset(email: string): Promise<{ success: true }> {
  await supabase.auth
    .resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    })
    .catch(() => {
      // Slik elke fout — uniform response voorkomt enumeration.
      // Echte errors loggen we bewust niet hier (zou tot side-channel-leak
      // kunnen leiden via onverwachte logging-paden); Supabase Dashboard
      // logt zelf alle auth-events met IP voor forensisch onderzoek.
    });
  return { success: true };
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
