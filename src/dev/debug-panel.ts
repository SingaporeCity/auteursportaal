/**
 * Dev-only debug-panel rechtsonder in de UI tijdens `npm run dev`.
 *
 * Toont live de status van de belangrijkste integraties zodat je tijdens
 * ontwikkeling direct kunt zien:
 * - Welke Supabase URL actief is (gemaskeerd)
 * - Of er een sessie is en als wie je bent ingelogd
 * - Of het profiel uit de DB geladen kon worden
 * - Of RLS-isolatie werkt (een count-query op `authors` zou alleen je
 *   eigen rij + (als admin) andere rijen tonen — anders dan verwacht =
 *   security-bug)
 * - Laatste error die door de app is gemeld
 *
 * Wordt **alleen** in dev-mode geladen (`import.meta.env.DEV`). In de
 * productie-build is deze module dood-stripped door tree-shaking.
 *
 * @module dev/debug-panel
 */

import { supabase } from '@/lib/supabase';

interface PanelState {
  supabaseUrl: string;
  authState: string;
  profileState: string;
  rlsState: string;
  lastError: string;
}

let panelEl: HTMLDivElement | null = null;
const state: PanelState = {
  supabaseUrl: '...',
  authState: '...',
  profileState: '...',
  rlsState: '...',
  lastError: '—',
};

/**
 * Mount het debug-panel in de DOM en start de checks.
 * Roep één keer aan vanuit `main.ts` als `import.meta.env.DEV` waar is.
 */
export function mountDebugPanel(): void {
  if (panelEl !== null) {
    return;
  }

  panelEl = document.createElement('div');
  panelEl.id = 'dev-debug-panel';
  panelEl.style.cssText = `
    position: fixed;
    bottom: 12px;
    right: 12px;
    width: 320px;
    max-height: 70vh;
    overflow: auto;
    background: rgba(15, 17, 23, 0.95);
    color: #e8eaed;
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 11px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid #2a2d3a;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    z-index: 999999;
    line-height: 1.5;
  `;
  document.body.appendChild(panelEl);

  const url = import.meta.env.VITE_SUPABASE_URL;
  state.supabaseUrl = maskUrl(url);

  render();
  void runChecks();

  // Re-run checks bij auth-state changes
  supabase.auth.onAuthStateChange(() => {
    void runChecks();
  });
}

/**
 * Logt een error in het debug-panel (en console).
 */
export function reportError(context: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  state.lastError = `[${context}] ${msg}`;
  console.error(`[debug] ${context}:`, error);
  render();
}

async function runChecks(): Promise<void> {
  // -- auth state
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session === null) {
    state.authState = '🔒 niet ingelogd (anon)';
    state.profileState = '—';
    state.rlsState = '—';
    render();
    return;
  }

  const userEmail = sessionData.session.user.email ?? '?';
  state.authState = `✅ ${userEmail}`;

  // -- profile state
  const userId = sessionData.session.user.id;
  const { data: profile, error: profileErr } = await supabase
    .from('authors')
    .select('id, first_name, last_name, is_admin, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr !== null) {
    state.profileState = `⚠️ ${profileErr.message}`;
  } else if (profile === null) {
    state.profileState = '❌ geen authors-record';
  } else {
    const role = profile.is_admin ? 'admin' : profile.is_active ? 'auteur' : 'inactive';
    state.profileState = `✅ ${profile.first_name} ${profile.last_name} (${role})`;
  }

  // -- RLS isolatie test
  const { count, error: rlsErr } = await supabase
    .from('authors')
    .select('*', { count: 'exact', head: true });

  if (rlsErr !== null) {
    state.rlsState = `⚠️ ${rlsErr.message}`;
  } else if (count === null) {
    state.rlsState = '? geen count terug';
  } else if (profile?.is_admin) {
    state.rlsState = `✅ admin ziet ${count} authors (alle)`;
  } else if (count === 1) {
    state.rlsState = '✅ ziet 1 authors-record (alleen eigen — RLS OK)';
  } else if (count === 0) {
    state.rlsState = '⚠️ ziet 0 records (zou eigen profiel moeten zien)';
  } else {
    state.rlsState = `🚨 ziet ${count} records — RLS LEK?!`;
  }

  render();
}

function render(): void {
  if (panelEl === null) {
    return;
  }
  panelEl.replaceChildren();

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;color:#93c5cf;margin-bottom:6px;';
  title.textContent = '⚙️ DEV DEBUG (alleen lokaal)';
  panelEl.appendChild(title);

  appendRow('Supabase', state.supabaseUrl);
  appendRow('Auth', state.authState);
  appendRow('Profile', state.profileState);
  appendRow('RLS test', state.rlsState);
  appendRow('Last error', state.lastError);

  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:8px;font-size:10px;color:#8b8fa4;';
  hint.textContent = 'Dit panel staat alleen in npm run dev — niet in de productie-bundle.';
  panelEl.appendChild(hint);
}

function appendRow(label: string, value: string): void {
  if (panelEl === null) {
    return;
  }
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;';

  const lab = document.createElement('span');
  lab.style.cssText = 'color:#8b8fa4;min-width:72px;flex-shrink:0;';
  lab.textContent = label;

  const val = document.createElement('span');
  val.style.cssText = 'color:#e8eaed;word-break:break-all;';
  val.textContent = value;

  row.appendChild(lab);
  row.appendChild(val);
  panelEl.appendChild(row);
}

function maskUrl(url: string | undefined): string {
  if (typeof url !== 'string' || url.length === 0) {
    return '(geen URL gezet)';
  }
  // qcqjurglmrhdiuhawfee → qcq…wfee
  const match = /^https:\/\/([^.]+)\.supabase\.co$/.exec(url);
  if (match === null) {
    return url;
  }
  const ref = match[1];
  if (typeof ref !== 'string' || ref.length < 8) {
    return url;
  }
  return `${ref.slice(0, 3)}…${ref.slice(-4)}.supabase.co`;
}
