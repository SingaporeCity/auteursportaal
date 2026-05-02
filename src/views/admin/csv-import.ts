/**
 * Admin: CSV-import modal voor bulk-aanmaken van auteurs uit NetSuite-export.
 *
 * Stappen:
 *  1. File-upload (CSV)
 *  2. Modus-keuze: 'create_only' (nieuwe rijen) of 'upsert' (bestaande bijwerken)
 *  3. Submit → roept Edge Function `import-authors-csv` aan met CSV-tekst
 *  4. Toont resultaat: aantal aangemaakt/bijgewerkt/overgeslagen + error-lijst
 *
 * Het format en de validatie staat in `docs/onboarding-csv-import.md` +
 * de Edge Function. Frontend doet alleen file-read en presentatie.
 *
 * @module views/admin/csv-import
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  bsn_skipped: number;
  errors: { row: number; email: string; reason: string }[];
}

export function openCsvImportModal(onDone: () => void): void {
  if (document.querySelector('.modal-overlay.csv-import-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay csv-import-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-import-modal';
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
  heading.textContent = t('admin.csv_import_heading');
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.csv_import_intro');
  modal.appendChild(intro);

  // -- File input
  const fileLabel = document.createElement('label');
  fileLabel.className = 'auth-field';
  const fileSpan = document.createElement('span');
  fileSpan.textContent = t('admin.csv_import_file_label');
  fileLabel.appendChild(fileSpan);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileInput.required = true;
  fileLabel.appendChild(fileInput);
  modal.appendChild(fileLabel);

  // -- Mode radio
  const modeWrap = document.createElement('fieldset');
  modeWrap.className = 'csv-import-mode';
  const modeLegend = document.createElement('legend');
  modeLegend.textContent = t('admin.csv_import_mode_legend');
  modeWrap.appendChild(modeLegend);

  const createOnly = buildRadio(
    'mode',
    'create_only',
    t('admin.csv_import_mode_create_only'),
    true
  );
  const upsert = buildRadio('mode', 'upsert', t('admin.csv_import_mode_upsert'), false);
  modeWrap.appendChild(createOnly.label);
  modeWrap.appendChild(upsert.label);
  modal.appendChild(modeWrap);

  // -- Status + submit
  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  modal.appendChild(status);

  const resultBox = document.createElement('div');
  resultBox.className = 'csv-import-result';
  resultBox.hidden = true;
  modal.appendChild(resultBox);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'auth-submit';
  submit.textContent = t('admin.csv_import_submit');
  modal.appendChild(submit);

  // -- Handlers
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
    const file = fileInput.files?.[0];
    if (file === undefined) {
      showStatus(status, 'error', 'Selecteer eerst een CSV-bestand.');
      return;
    }
    const mode = upsert.input.checked ? 'upsert' : 'create_only';
    void runImport(file, mode, submit, status, resultBox);
  });

  document.body.appendChild(overlay);
}

async function runImport(
  file: File,
  mode: 'create_only' | 'upsert',
  submit: HTMLButtonElement,
  status: HTMLElement,
  resultBox: HTMLElement
): Promise<void> {
  submit.disabled = true;
  submit.textContent = t('common.busy');
  status.hidden = true;
  resultBox.hidden = true;

  try {
    const csv = await file.text();
    const result = await supabase.functions.invoke<ImportResult>('import-authors-csv', {
      body: { csv, mode },
    });

    const fnError = extractFnError(result.error);
    if (fnError !== null) {
      reportError('admin.csvImport', fnError);
      showStatus(status, 'error', `Importeren faalde: ${fnError.message}`);
      submit.disabled = false;
      submit.textContent = t('admin.csv_import_submit');
      return;
    }

    const data = result.data;
    if (data === null) {
      showStatus(status, 'error', 'Geen resultaat ontvangen van Edge Function.');
      submit.disabled = false;
      submit.textContent = t('admin.csv_import_submit');
      return;
    }

    renderResult(resultBox, data);
    submit.textContent = t('admin.csv_import_close');
    submit.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showStatus(status, 'error', `Onverwachte fout: ${message}`);
    submit.disabled = false;
    submit.textContent = t('admin.csv_import_submit');
  }
}

function renderResult(box: HTMLElement, result: ImportResult): void {
  box.replaceChildren();
  box.hidden = false;

  const summary = document.createElement('div');
  summary.className = 'csv-import-summary';
  summary.innerHTML = '';
  const items: { label: string; value: number; cls: string }[] = [
    { label: t('admin.csv_import_stat_created'), value: result.created, cls: 'success' },
    { label: t('admin.csv_import_stat_updated'), value: result.updated, cls: 'info' },
    { label: t('admin.csv_import_stat_skipped'), value: result.skipped, cls: 'warning' },
  ];
  if (result.bsn_skipped > 0) {
    items.push({
      label: t('admin.csv_import_stat_bsn_skipped'),
      value: result.bsn_skipped,
      cls: 'warning',
    });
  }
  for (const item of items) {
    const span = document.createElement('span');
    span.className = `csv-import-stat csv-import-stat-${item.cls}`;
    span.textContent = `${item.label}: ${String(item.value)}`;
    summary.appendChild(span);
  }
  box.appendChild(summary);

  if (result.errors.length > 0) {
    const errHeading = document.createElement('h4');
    errHeading.textContent = t('admin.csv_import_errors_heading').replace(
      '{count}',
      String(result.errors.length)
    );
    box.appendChild(errHeading);

    const list = document.createElement('ul');
    list.className = 'csv-import-errors';
    for (const err of result.errors) {
      const li = document.createElement('li');
      li.textContent = `Regel ${String(err.row)} (${err.email}): ${err.reason}`;
      list.appendChild(li);
    }
    box.appendChild(list);
  }
}

function buildRadio(
  name: string,
  value: string,
  text: string,
  checked: boolean
): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'csv-import-radio';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  label.appendChild(input);
  const span = document.createElement('span');
  span.textContent = text;
  label.appendChild(span);
  return { label, input };
}

function extractFnError(errVal: unknown): Error | null {
  if (errVal instanceof Error) {
    return errVal;
  }
  if (typeof errVal === 'string') {
    return new Error(errVal);
  }
  if (errVal !== null && errVal !== undefined) {
    return new Error('Edge Function call failed');
  }
  return null;
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
