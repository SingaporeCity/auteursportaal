/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ADMIN_EMAIL: string;
  readonly VITE_ADMIN_SSO_ENABLED: string;
  /** Test-fase: zet op 'true' om TOTP-challenge + verplichte enrollment over te slaan. */
  readonly VITE_DISABLE_MFA?: string;
  /** Test-fase: minimum wachtwoord-lengte voor zelfgekozen wachtwoorden (default 12). */
  readonly VITE_PASSWORD_MIN_LENGTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
