/**
 * Admin: CSV-export modal voor round-trip-sync naar NetSuite.
 *
 * Flow:
 *  1. Modal opent → toont preview van wat in export komt (rijen sinds vorige
 *     export, namen + emails) + optioneel reason-veld
 *  2. Admin klikt "Exporteer & download" → roept Edge Function `export-authors-csv` aan
 *  3. Edge Function returnt CSV in body + audit-headers (X-Export-Id, X-Export-Hash)
 *  4. Frontend triggert browser-download (blob → anchor.click)
 *  5. Toont confirmation: "Upload binnen 5 minuten naar Noordhoff SharePoint"
 *
 * Geen dubbele exports mogelijk: na succesvolle export is `last_exported_at`
 * server-side bijgewerkt, dus tweede klik toont 'Geen wijzigingen sinds vorige export'.
 *
 * @module views/admin/csv-export
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import type { AuthorRow } from '@/auth';

interface PreviewState {
  rows: AuthorRow[];
}

export function openCsvExportModal(allAuthors: AuthorRow[], onDone: () => void): void {
  if (document.querySelector('.modal-overlay.csv-export-overlay') !== null) {
    return;
  }

  // Filter rijen die in volgende export gaan: niet-admin + (last_exported_at IS NULL OR last_exported_at < updated_at)
  const candidates = allAuthors.filter((a) => {
    if (a.is_admin) {
      return false;
    }
    if (a.last_exported_at === null) {
      return true;
    }
    return a.last_exported_at < a.updated_at;
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay csv-export-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-export-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Sluiten');
  modal.appendChild(closeBtn);

  const heading = document.createElement('h3');
  heading.textContent = 'Export naar NetSuite';
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent =
    'Genereert een CSV met alle auteursgegevens die zijn gewijzigd of nieuw geactiveerd sinds vorige export. Bestand wordt gedownload — upload binnen enkele minuten naar Noordhoff SharePoint en verwijder lokaal.';
  modal.appendChild(intro);

  const state: PreviewState = { rows: candidates };

  // Preview-block
  const preview = document.createElement('div');
  preview.className = 'csv-export-preview';
  modal.appendChild(preview);
  renderPreview(preview, state);

  // Reason-veld
  const reasonWrap = document.createElement('label');
  reasonWrap.className = 'auth-field';
  const reasonSpan = document.createElement('span');
  reasonSpan.textContent = 'Reden / opmerking (optioneel — komt in audit-log)';
  reasonWrap.appendChild(reasonSpan);
  const reasonInput = document.createElement('input');
  reasonInput.type = 'text';
  reasonInput.placeholder = 'bv. Wekelijkse NetSuite-sync';
  reasonInput.maxLength = 500;
  reasonWrap.appendChild(reasonInput);
  modal.appendChild(reasonWrap);

  // Status + submit
  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  modal.appendChild(status);

  const successBox = document.createElement('div');
  successBox.className = 'csv-export-success';
  successBox.hidden = true;
  modal.appendChild(successBox);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'auth-submit';
  submit.textContent = `Exporteer & download (${String(state.rows.length)} rijen)`;
  submit.disabled = state.rows.length === 0;
  modal.appendChild(submit);

  // Handlers
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    onDone();
  };
  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', escHandler);

  submit.addEventListener('click', () => {
    void runExport(reasonInput.value.trim(), submit, status, successBox);
  });

  document.body.appendChild(overlay);
}

function renderPreview(container: HTMLElement, state: PreviewState): void {
  container.replaceChildren();

  if (state.rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'csv-export-empty';
    empty.textContent = 'Geen wijzigingen sinds vorige export.';
    container.appendChild(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'csv-export-summary';
  summary.textContent = `${String(state.rows.length)} auteur(s) komen in deze export:`;
  container.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'csv-export-row-list';
  for (const row of state.rows.slice(0, 50)) {
    const li = document.createElement('li');
    const reason = row.last_exported_at === null ? 'nieuw' : 'gewijzigd';
    li.textContent = `${row.first_name} ${row.last_name} (${row.email}) — ${reason}`;
    list.appendChild(li);
  }
  if (state.rows.length > 50) {
    const more = document.createElement('li');
    more.className = 'csv-export-row-more';
    more.textContent = `… en ${String(state.rows.length - 50)} meer`;
    list.appendChild(more);
  }
  container.appendChild(list);
}

async function runExport(
  reason: string,
  submit: HTMLButtonElement,
  status: HTMLElement,
  successBox: HTMLElement
): Promise<void> {
  submit.disabled = true;
  submit.textContent = 'Bezig…';
  status.hidden = true;
  successBox.hidden = true;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (accessToken === undefined) {
      showStatus(status, 'error', 'Geen actieve sessie.');
      submit.disabled = false;
      submit.textContent = 'Exporteer & download';
      return;
    }

    // Custom fetch i.p.v. supabase.functions.invoke — we hebben de raw response
    // headers nodig (Content-Disposition + X-Export-Hash) en body als blob
    const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/export-authors-csv`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: reason.length > 0 ? reason : undefined }),
    });

    const contentType = response.headers.get('Content-Type') ?? '';

    if (!response.ok || contentType.includes('application/json')) {
      const errBody = (await response.json().catch(() => ({ error: 'unknown' }))) as {
        error?: string;
        message?: string;
      };
      const msg = errBody.error ?? errBody.message ?? 'unknown error';
      if (msg === 'no_changes') {
        showStatus(status, 'error', 'Geen wijzigingen sinds vorige export.');
      } else {
        showStatus(status, 'error', `Export faalde: ${msg}`);
      }
      submit.disabled = false;
      submit.textContent = 'Exporteer & download';
      return;
    }

    // Parse audit-headers
    const exportId = response.headers.get('X-Export-Id') ?? 'onbekend';
    const exportHash = response.headers.get('X-Export-Hash') ?? '';
    const rowCount = response.headers.get('X-Export-Row-Count') ?? '?';
    const filename = parseFilename(response.headers.get('Content-Disposition')) ?? 'export.csv';

    const blob = await response.blob();
    triggerDownload(blob, filename);

    // Toon audit-info
    successBox.hidden = false;
    successBox.replaceChildren();
    const ok = document.createElement('div');
    ok.className = 'csv-export-success-heading';
    ok.textContent = `✅ ${rowCount} rijen geëxporteerd — ${filename}`;
    successBox.appendChild(ok);

    const sub = document.createElement('p');
    sub.className = 'csv-export-success-text';
    sub.textContent =
      'Upload deze CSV nu naar Noordhoff SharePoint en verwijder lokaal. Audit-log:';
    successBox.appendChild(sub);

    const auditDl = document.createElement('dl');
    auditDl.className = 'csv-export-audit';
    auditDl.appendChild(buildAuditEntry('Export-ID', exportId));
    if (exportHash.length > 0) {
      auditDl.appendChild(buildAuditEntry('SHA256', exportHash));
    }
    successBox.appendChild(auditDl);

    submit.textContent = 'Sluiten';
    submit.disabled = false;
    submit.addEventListener('click', () => {
      const overlay = document.querySelector<HTMLElement>('.csv-export-overlay');
      overlay?.remove();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError('admin.csvExport', new Error(message));
    showStatus(status, 'error', `Onverwachte fout: ${message}`);
    submit.disabled = false;
    submit.textContent = 'Exporteer & download';
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function parseFilename(disposition: string | null): string | null {
  if (disposition === null) {
    return null;
  }
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return match?.[1] ?? null;
}

function buildAuditEntry(label: string, value: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  frag.appendChild(dt);
  frag.appendChild(dd);
  return frag;
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
