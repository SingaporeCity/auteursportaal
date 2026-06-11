/**
 * Quick-login shortcuts — Ctrl+Shift+L (auteur) / Ctrl+Shift+A (admin).
 *
 * Credentials komen NOOIT in de bundle (de repo is public):
 *  - dev (`npm run dev`): uit `VITE_DEV_*` in de lokale, gitignored `.env`.
 *    De reads zijn DEV-gated zodat Vite ze uit productie-builds wegoptimaliseert,
 *    ook als de vars bij een lokale `npm run build` in de .env staan.
 *  - productie: uit `localStorage` (`quick-login.author` / `quick-login.admin`,
 *    JSON `{email, password}`), die de demo-gever eenmalig zelf in de eigen
 *    browser zet. Zonder die keys doet de shortcut niets — een bezoeker die de
 *    bundle leest vindt alleen het mechanisme, geen geheimen.
 *
 * TIJDELIJK (demo 2026-06-11): geregistreerd in productie via `main.ts`.
 * Terugdraaien = registratie weer in het `import.meta.env.DEV`-blok zetten.
 *
 * Bij een actieve sessie wordt eerst uitgelogd zodat je vanaf elk scherm van
 * rol kunt wisselen; de `onAuthStateChange`-listener in `main.ts` rendert
 * daarna opnieuw via de normale state-machine.
 *
 * @module dev/quick-login
 */

import { signInWithPassword, signOut, getActiveSession } from '@/auth';

interface QuickAccount {
  email: string;
  password: string;
}

function fromEnv(role: 'author' | 'admin'): QuickAccount | null {
  // DEV-gate vóór de env-reads: in prod-builds is dit statisch `false`,
  // waardoor Vite de VITE_DEV_*-waarden niet in de bundle inlinet.
  if (!import.meta.env.DEV) {
    return null;
  }
  const email =
    role === 'author'
      ? (import.meta.env['VITE_DEV_AUTHOR_EMAIL'] as string | undefined)
      : (import.meta.env['VITE_DEV_ADMIN_EMAIL'] as string | undefined);
  const password =
    role === 'author'
      ? (import.meta.env['VITE_DEV_AUTHOR_PASSWORD'] as string | undefined)
      : (import.meta.env['VITE_DEV_ADMIN_PASSWORD'] as string | undefined);
  if (email === undefined || password === undefined) {
    return null;
  }
  return { email, password };
}

function fromStorage(role: 'author' | 'admin'): QuickAccount | null {
  try {
    const raw = localStorage.getItem(`quick-login.${role}`);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as { email?: unknown; password?: unknown };
    if (typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return { email: parsed.email, password: parsed.password };
    }
    return null;
  } catch {
    return null;
  }
}

let busy = false;

export function registerQuickLoginShortcuts(): void {
  console.info('[quick-login] actief — Ctrl+Shift+L = auteur, Ctrl+Shift+A = admin');
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) {
      return;
    }
    const key = e.key.toLowerCase();
    if (key !== 'l' && key !== 'a') {
      return;
    }
    e.preventDefault();
    void quickLogin(key === 'l' ? 'author' : 'admin');
  });
}

/**
 * Eenmalige setup zonder console: vraag e-mail + wachtwoord via `prompt()` en
 * bewaar ze in localStorage voor volgende keren. Annuleren = afbreken.
 */
function promptAndStore(role: 'author' | 'admin'): QuickAccount | null {
  // eslint-disable-next-line no-alert -- bewust: eenmalige credential-setup zonder UI
  const email = window.prompt(`Quick-login '${role}' instellen — e-mailadres:`);
  if (email === null || email.trim() === '') {
    return null;
  }
  // eslint-disable-next-line no-alert -- bewust: eenmalige credential-setup zonder UI
  const password = window.prompt(`Quick-login '${role}' — wachtwoord voor ${email.trim()}:`);
  if (password === null || password === '') {
    return null;
  }
  const account: QuickAccount = { email: email.trim(), password };
  try {
    localStorage.setItem(`quick-login.${role}`, JSON.stringify(account));
  } catch {
    // Opslag vol/geblokkeerd — login werkt deze keer alsnog, alleen niet onthouden.
  }
  return account;
}

async function quickLogin(role: 'author' | 'admin'): Promise<void> {
  if (busy) {
    return;
  }
  const account = fromEnv(role) ?? fromStorage(role) ?? promptAndStore(role);
  if (account === null) {
    return;
  }

  busy = true;
  try {
    const session = await getActiveSession();
    if (session !== null) {
      await signOut();
    }
    const result = await signInWithPassword(account.email, account.password);
    if (!result.success) {
      console.warn(`[quick-login] inloggen als ${role} mislukt:`, result.error);
      if (result.error === 'invalid_credentials') {
        // Fout opgeslagen wachtwoord? Weggooien zodat de volgende druk op de
        // sneltoets opnieuw om credentials vraagt.
        localStorage.removeItem(`quick-login.${role}`);
      }
    }
  } finally {
    busy = false;
  }
}
