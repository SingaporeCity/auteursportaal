/**
 * Entry point voor het Noordhoff Auteursportaal.
 *
 * Bootstrap-volgorde:
 *  1. CSS importeren
 *  2. i18n initialiseren (uit localStorage of browser-voorkeur)
 *  3. Dev debug-panel mounten (alleen in `npm run dev`)
 *  4. Sessie restoren → juiste view tonen (login / auteur-dashboard / admin / no-access)
 *  5. Auth-state listener registreren zodat in-/uitloggen direct opnieuw rendert
 *
 * @module main
 */

import './styles/main.css';
import { initLocale, t } from '@/lib/i18n';
import { restoreSession, onAuthStateChange, signOut } from '@/auth';
import { renderLoginView } from '@/views/login';
import { renderDashboardView } from '@/views/dashboard';
import { renderAdminView } from '@/views/admin';

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
  }

  await render(rootEl);

  onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      void render(rootEl);
    }
    // PASSWORD_RECOVERY wordt later afgehandeld door een set-password view.
  });
}

async function render(rootEl: HTMLElement): Promise<void> {
  const decision = await restoreSession();

  if (decision === null) {
    renderLoginView(rootEl);
    return;
  }

  if (!decision.granted) {
    renderNoAccess(rootEl, decision.reason);
    return;
  }

  if (decision.role === 'admin') {
    renderAdminView(rootEl, decision.author);
  } else {
    renderDashboardView(rootEl, decision.author);
  }
}

function renderNoAccess(rootEl: HTMLElement, reason: 'no_profile' | 'not_active'): void {
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
  reasonHint.textContent =
    reason === 'no_profile'
      ? '(geen profielregistratie gevonden voor dit account)'
      : '(account is nog niet door de beheerder geactiveerd)';
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
