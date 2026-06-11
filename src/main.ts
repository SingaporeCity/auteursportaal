/**
 * Entry point voor het Noordhoff Auteursportaal.
 *
 * Bootstrap-volgorde:
 *  1. CSS importeren
 *  2. i18n initialiseren (uit localStorage of browser-voorkeur)
 *  3. Dev debug-panel mounten (alleen in `npm run dev`)
 *  4. Auth-state-machine doorlopen → juiste view tonen
 *  5. Auth-state listener registreren zodat in-/uitloggen direct opnieuw rendert
 *
 * Routing-volgorde na succesvolle login:
 *   session → MFA-challenge (als aal-upgrade nodig) → force-password-change
 *   (als must_change_password) → MFA-enroll (als geen verified factor) → portal/admin
 *
 * @module main
 */

import './styles/main.css';
import { initLocale, t } from '@/lib/i18n';
import {
  getActiveSession,
  loadOwnProfile,
  onAuthStateChange,
  signOut,
  decideAccess,
  type AuthorRow,
  type AccessGranted,
} from '@/auth';
import { supabase } from '@/lib/supabase';
import { renderLoginView } from '@/views/login';
import { renderDashboardView } from '@/views/dashboard';
import { renderAdminView } from '@/views/admin';
import { renderForcePasswordChangeView } from '@/views/force-password-change';
import { renderMfaEnrollView } from '@/views/mfa-enroll';
import { renderMfaChallengeView } from '@/views/mfa-challenge';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app root element in index.html');
}

void bootstrap(root);

async function bootstrap(rootEl: HTMLElement): Promise<void> {
  initLocale();

  if (import.meta.env.DEV) {
    const { mountDebugPanel } = await import('@/dev/debug-panel');
    mountDebugPanel();
    const { registerQuickLoginShortcuts } = await import('@/dev/quick-login');
    registerQuickLoginShortcuts();
  }

  await render(rootEl);

  onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      void render(rootEl);
    }
    // PASSWORD_RECOVERY wordt later afgehandeld door een set-password view.
  });

  // Custom event vanuit force-password-change + mfa-enroll + mfa-challenge:
  // forceer een schone restoreSession-cycle. USER_UPDATED kan racen met onze
  // eigen authors-table UPDATE (must_change_password=false), dus vertrouwen
  // we niet op het auth-event alleen.
  window.addEventListener('auth:rerender', () => {
    void render(rootEl);
  });
}

async function render(rootEl: HTMLElement): Promise<void> {
  const state = await determineAuthState();

  switch (state.kind) {
    case 'no_session':
      renderLoginView(rootEl);
      return;
    case 'no_access':
      renderNoAccess(rootEl, state.reason);
      return;
    case 'mfa_challenge_required':
      renderMfaChallengeView(rootEl, state.factorId);
      return;
    case 'force_password_change':
      renderForcePasswordChangeView(rootEl, state.author.id);
      return;
    case 'mfa_enroll_required':
      renderMfaEnrollView(rootEl, state.author);
      return;
    case 'granted':
      if (state.role === 'admin') {
        renderAdminView(rootEl, state.author);
      } else {
        renderDashboardView(rootEl, state.author, state.mode);
      }
      return;
  }
}

// =============================================================================
// Auth state-machine
// =============================================================================
type AuthState =
  | { kind: 'no_session' }
  | { kind: 'no_access'; reason: 'no_profile' }
  | { kind: 'mfa_challenge_required'; factorId: string }
  | { kind: 'force_password_change'; author: AuthorRow }
  | { kind: 'mfa_enroll_required'; author: AuthorRow }
  | {
      kind: 'granted';
      author: AuthorRow;
      role: AccessGranted['role'];
      mode: AccessGranted['mode'];
    };

/**
 * Test-fase kill-switch: zet `VITE_DISABLE_MFA=true` in `.env.local` om zowel
 * de TOTP-challenge bij login als de geforceerde enrollment over te slaan.
 * Bestaande factors blijven in `auth.mfa_factors` staan; de admin-UI toont
 * `mfa_enrolled` nog gewoon. Zodra deze vlag weg gaat treedt de enforcement
 * weer in werking.
 */
const MFA_DISABLED = import.meta.env.VITE_DISABLE_MFA === 'true';

async function determineAuthState(): Promise<AuthState> {
  const session = await getActiveSession();
  if (session === null) {
    return { kind: 'no_session' };
  }

  // Stap 1: heeft de huidige sessie een MFA-challenge nodig? Dit gebeurt
  // wanneer de gebruiker is ingelogd met enkel password (aal1) terwijl er
  // een verified TOTP-factor is (nextLevel='aal2'). Dan moeten we die
  // 6-cijferige code afdwingen voordat we wat dan ook tonen.
  if (!MFA_DISABLED) {
    const aalResp = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      aalResp.data !== null &&
      aalResp.data.currentLevel === 'aal1' &&
      aalResp.data.nextLevel === 'aal2'
    ) {
      const factorsResp = await supabase.auth.mfa.listFactors();
      if (factorsResp.data !== null) {
        // `factors.totp` bevat alleen al-verified TOTP-factors (Supabase-API);
        // eerste item is voldoende voor de challenge.
        const verifiedTotp = factorsResp.data.totp[0];
        if (verifiedTotp !== undefined) {
          return { kind: 'mfa_challenge_required', factorId: verifiedTotp.id };
        }
      }
      // Geen verified factor maar aal-upgrade vereist: shouldn't happen.
      // Door naar normale flow; mfa-enroll-check vangt het op.
    }
  }

  // Stap 2: profiel laden + whitelist
  const profile = await loadOwnProfile();
  const access = decideAccess(profile);
  if (!access.granted) {
    return { kind: 'no_access', reason: access.reason };
  }

  // Stap 3 + 4 zijn alleen relevant voor accounts in 'full'-mode (admins
  // en geactiveerde auteurs). Een auteur in onboarding-modus mag direct
  // zijn persoonsgegevens invullen zonder eerst zijn wachtwoord te
  // wijzigen of TOTP te enrollen — die hekken komen pas zodra de admin
  // het account activeert (de activeer-flow zet `must_change_password`
  // dan op true).
  if (access.mode === 'full') {
    // Stap 3: forced password change?
    if (access.author.must_change_password) {
      return { kind: 'force_password_change', author: access.author };
    }

    // Stap 4: forced MFA enrollment? Vereist voor IEDEREEN met een actief
    // account (admins + geactiveerde auteurs), tenzij de test-fase-kill-
    // switch aanstaat. `factors.totp` bevat alleen verified factors;
    // lege array = nog niet geconfigureerd → enrollment afdwingen.
    if (!MFA_DISABLED) {
      const factorsResp = await supabase.auth.mfa.listFactors();
      if (factorsResp.data !== null && factorsResp.data.totp.length === 0) {
        return { kind: 'mfa_enroll_required', author: access.author };
      }
    }
  }

  // Alle hekken open
  return {
    kind: 'granted',
    author: access.author,
    role: access.role,
    mode: access.mode,
  };
}

// =============================================================================
// "Geen toegang"-fallback
// =============================================================================
function renderNoAccess(rootEl: HTMLElement, reason: 'no_profile'): void {
  rootEl.replaceChildren();

  const card = document.createElement('div');
  card.className = 'no-access-card';

  const heading = document.createElement('h2');
  heading.textContent = t('auth.no_access.title');
  card.appendChild(heading);

  const msg = document.createElement('p');
  msg.textContent = t('auth.no_access.message');
  card.appendChild(msg);

  const reasonHint = document.createElement('small');
  reasonHint.className = 'no-access-reason';
  reasonHint.textContent = '(geen profielregistratie gevonden voor dit account)';
  void reason;
  card.appendChild(reasonHint);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'auth-submit';
  logoutBtn.textContent = t('auth.logout');
  logoutBtn.addEventListener('click', () => {
    void signOut();
  });
  card.appendChild(logoutBtn);

  rootEl.appendChild(card);
}
