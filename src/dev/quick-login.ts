/**
 * Dev-only quick-login shortcuts — alleen geladen via dynamic import achter
 * `import.meta.env.DEV` in `main.ts`, dus volledig tree-shaken uit de
 * productie-bundle (de repo is public; credentials mogen nooit in `dist/`).
 *
 * Sneltoetsen:
 *  - Ctrl+Shift+L → inloggen als auteur  (VITE_DEV_AUTHOR_EMAIL/_PASSWORD)
 *  - Ctrl+Shift+A → inloggen als admin   (VITE_DEV_ADMIN_EMAIL/_PASSWORD)
 *
 * Credentials komen uit de lokale `.env` (gitignored). Bij een actieve sessie
 * wordt eerst uitgelogd zodat je vanaf elk scherm van rol kunt wisselen; de
 * bestaande `onAuthStateChange`-listener in `main.ts` rendert daarna opnieuw
 * via de normale state-machine (MFA-challenge etc. blijven dus gewoon gelden).
 *
 * @module dev/quick-login
 */

import { signInWithPassword, signOut, getActiveSession } from '@/auth';

interface QuickAccount {
  label: string;
  email: string | undefined;
  password: string | undefined;
}

const ACCOUNTS: Record<'author' | 'admin', QuickAccount> = {
  author: {
    label: 'auteur',
    email: import.meta.env['VITE_DEV_AUTHOR_EMAIL'] as string | undefined,
    password: import.meta.env['VITE_DEV_AUTHOR_PASSWORD'] as string | undefined,
  },
  admin: {
    label: 'admin',
    email: import.meta.env['VITE_DEV_ADMIN_EMAIL'] as string | undefined,
    password: import.meta.env['VITE_DEV_ADMIN_PASSWORD'] as string | undefined,
  },
};

let busy = false;

export function registerQuickLoginShortcuts(): void {
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

async function quickLogin(role: 'author' | 'admin'): Promise<void> {
  if (busy) {
    return;
  }
  const account = ACCOUNTS[role];
  if (account.email === undefined || account.password === undefined) {
    console.warn(
      `[quick-login] VITE_DEV_${role.toUpperCase()}_EMAIL/_PASSWORD ontbreken in .env — shortcut genegeerd.`
    );
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
      console.warn(`[quick-login] inloggen als ${account.label} mislukt:`, result.error);
    }
  } finally {
    busy = false;
  }
}
