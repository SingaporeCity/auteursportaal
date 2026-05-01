/**
 * Microsoft Entra ID SSO voor admin-login.
 *
 * **STATUS: PLACEHOLDER** — niet actief in productie tot Infinitas IT
 * de Azure-tenant + OAuth-app heeft geconfigureerd in het Supabase
 * dashboard (Authentication → Providers → Azure).
 *
 * Activeren door:
 *   1. Azure App Registration aanmaken in Entra ID-tenant.
 *   2. Redirect URI toevoegen: `https://qcqjurglmrhdiuhawfee.supabase.co/auth/v1/callback`.
 *   3. Client ID + secret in Supabase: Auth → Providers → Azure invullen.
 *   4. Tenant ID toevoegen (single-tenant setup) of gebruik `common`.
 *   5. Admin consent geven via de Azure portal.
 *   6. `VITE_ADMIN_SSO_ENABLED=true` in `.env` + GitHub Action secret.
 *
 * Tot stap 6 is `signInWithAzure()` een no-op die via `isAdminSsoEnabled()`
 * wordt afgevangen door de UI (login-pagina toont een "binnenkort beschikbaar"
 * notitie en valt terug op email+password).
 *
 * @module auth/sso
 */

import { supabase } from '@/lib/supabase';

/**
 * Of de SSO-flow zichtbaar mag zijn in de UI. Gegated op een Vite env-var
 * zodat we de placeholder-code wel kunnen blijven type-checken zonder dat
 * eindgebruikers er per ongeluk gebruik van maken.
 */
export function isAdminSsoEnabled(): boolean {
  return import.meta.env.VITE_ADMIN_SSO_ENABLED === 'true';
}

/**
 * Start de Azure OAuth-flow. Werkt pas zodra Infinitas IT de provider in
 * Supabase heeft geactiveerd (zie module-doc).
 */
export async function signInWithAzure(): Promise<{ success: boolean; error?: string }> {
  if (!isAdminSsoEnabled()) {
    return {
      success: false,
      error: 'admin_sso_not_configured',
    };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email openid profile',
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error !== null) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
