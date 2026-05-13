/**
 * Admin: Excel-import modal voor bulk-aanmaken van bestaande auteurs.
 *
 * Verwacht het NetSuite-Vendors-export-formaat (12 kolommen, zie
 * `Upload test existing authors - 2.xlsx`). Frontend parset client-side met
 * SheetJS, mapt de rijen naar de body-shape, en roept de Edge Function
 * `bulk-create-existing-authors` aan. Voor elke rij wordt een Supabase-auth-
 * user aangemaakt met initieel wachtwoord 'Noordhoff' (server-side hardcoded
 * tijdens test-fase). Mailings zijn globaal afgeschakeld via env-var.
 *
 * @module views/admin/excel-import
 */

import type * as XLSXNamespace from 'xlsx';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import { parseExcelSerialDate } from '@/lib/excel-import-helpers';
import { extractFnError, formatFnErrorMessage } from '@/lib/edge-function-errors';

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; email: string; reason: string }[];
}

interface BulkRow {
  vendor_id: string;
  internal_id: string;
  name: string;
  address_line: string;
  city: string;
  zip: string;
  country: string;
  bsn: string;
  email: string;
  bic: string;
  iban: string;
  birth_date: string; // ISO YYYY-MM-DD of ''
}

/** Verwachte Excel-kolomvolgorde — komt 1-op-1 uit NetSuite-Vendor-export. */
const EXPECTED_HEADERS = [
  'ID',
  'Internal ID',
  'Name',
  'Billing Address 1',
  'Billing City',
  'Billing Zip',
  'Billing Country',
  'Personal Identification Number',
  'Email',
  'BIC',
  'IBAN',
  'Date of Birth',
] as const;

export function openExcelImportModal(onDone: () => void): void {
  if (document.querySelector('.modal-overlay.excel-import-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay excel-import-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-import-modal'; // hergebruik CSS-klasse van CSV-import
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
  heading.textContent = t('admin.excel_import_heading');
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.excel_import_intro');
  modal.appendChild(intro);

  // -- File input
  const fileLabel = document.createElement('label');
  fileLabel.className = 'auth-field';
  const fileSpan = document.createElement('span');
  fileSpan.textContent = t('admin.excel_import_file_label');
  fileLabel.appendChild(fileSpan);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept =
    '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  fileInput.required = true;
  fileLabel.appendChild(fileInput);
  modal.appendChild(fileLabel);

  // -- Status + result
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
  submit.textContent = t('admin.excel_import_submit');
  modal.appendChild(submit);

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
      showStatus(status, 'error', t('admin.excel_import_no_file'));
      return;
    }
    void runImport(file, submit, status, resultBox);
  });

  document.body.appendChild(overlay);
}

async function runImport(
  file: File,
  submit: HTMLButtonElement,
  status: HTMLElement,
  resultBox: HTMLElement
): Promise<void> {
  submit.disabled = true;
  submit.textContent = t('common.busy');
  status.hidden = true;
  resultBox.hidden = true;

  try {
    const buffer = await file.arrayBuffer();
    // Lazy-load xlsx: alleen admins die deze modal openen halen de ~400kB
    // SheetJS-bundle binnen, niet alle auteurs.
    const XLSX = await import('xlsx');
    const parsed = parseExcelBuffer(XLSX, buffer);
    if ('error' in parsed) {
      showStatus(status, 'error', parsed.error);
      submit.disabled = false;
      submit.textContent = t('admin.excel_import_submit');
      return;
    }

    if (parsed.rows.length === 0) {
      showStatus(status, 'error', t('admin.excel_import_empty'));
      submit.disabled = false;
      submit.textContent = t('admin.excel_import_submit');
      return;
    }

    const result = await supabase.functions.invoke<ImportResult>('bulk-create-existing-authors', {
      body: { rows: parsed.rows },
    });

    const fnError = await extractFnError(result.error);
    if (fnError !== null) {
      reportError('admin.excelImport', new Error(fnError.message));
      showStatus(
        status,
        'error',
        `${t('admin.excel_import_failed')}: ${formatFnErrorMessage(fnError)}`
      );
      submit.disabled = false;
      submit.textContent = t('admin.excel_import_submit');
      return;
    }

    const data = result.data;
    if (data === null) {
      showStatus(status, 'error', t('admin.excel_import_no_response'));
      submit.disabled = false;
      submit.textContent = t('admin.excel_import_submit');
      return;
    }

    renderResult(resultBox, data);
    submit.textContent = t('admin.excel_import_close');
    submit.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showStatus(status, 'error', `${t('admin.excel_import_unexpected')}: ${message}`);
    submit.disabled = false;
    submit.textContent = t('admin.excel_import_submit');
  }
}

/**
 * Parset het Excel-bestand naar de Edge-Function-body-shape. Header-validatie:
 * eerste rij moet exact de 12 NetSuite-Vendor-kolommen bevatten in volgorde
 * (case-insensitive). Lege onderaan staande rijen (alleen NULL/leeg) worden
 * stilzwijgend overgeslagen.
 */
function parseExcelBuffer(
  XLSX: typeof XLSXNamespace,
  buffer: ArrayBuffer
): { rows: BulkRow[] } | { error: string } {
  let wb: XLSXNamespace.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Kon Excel niet lezen: ${message}` };
  }

  const sheetName = wb.SheetNames[0];
  if (sheetName === undefined) {
    return { error: 'Excel bevat geen werkblad' };
  }
  const sheet = wb.Sheets[sheetName];
  if (sheet === undefined) {
    return { error: 'Werkblad kon niet worden geopend' };
  }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });
  if (raw.length < 2) {
    return { error: 'Excel moet een header-rij + minstens 1 data-rij bevatten' };
  }

  const header = (raw[0] ?? []).map((c) => toCellString(c).trim().toLowerCase());
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const expectedRaw = EXPECTED_HEADERS[i] ?? '';
    const expected = expectedRaw.toLowerCase();
    if (header[i] !== expected) {
      return {
        error: `Kolom ${String(i + 1)} verwacht "${expectedRaw}", maar gevonden "${header[i] ?? ''}"`,
      };
    }
  }

  const rows: BulkRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] ?? [];

    // Skip volledig lege rijen (NetSuite-exports hebben vaak een trail van leges)
    const isEmpty = cells.every((c) => c === null || c === undefined || c === '');
    if (isEmpty) {
      continue;
    }

    rows.push({
      vendor_id: toCellString(cells[0]).trim(),
      internal_id: toCellString(cells[1]).trim(),
      name: toCellString(cells[2]).trim(),
      address_line: toCellString(cells[3]).trim(),
      city: toCellString(cells[4]).trim(),
      zip: toCellString(cells[5]).trim(),
      country: toCellString(cells[6]).trim(),
      bsn: toCellString(cells[7]).trim(),
      email: toCellString(cells[8]).trim(),
      bic: toCellString(cells[9]).trim(),
      iban: toCellString(cells[10]).trim(),
      birth_date: parseExcelSerialDate(cells[11]),
    });
  }

  return { rows };
}

/**
 * Converteer een Excel-cel-waarde veilig naar string. SheetJS levert
 * strings, numbers, booleans, Date-objecten of null op. Objecten zonder
 * eigen toString() zouden anders als "[object Object]" eindigen.
 */
function toCellString(c: unknown): string {
  if (c === null || c === undefined || c === '') {
    return '';
  }
  if (typeof c === 'string') {
    return c;
  }
  if (typeof c === 'number' || typeof c === 'boolean') {
    return String(c);
  }
  if (c instanceof Date) {
    return c.toISOString().slice(0, 10);
  }
  return '';
}

function renderResult(box: HTMLElement, result: ImportResult): void {
  box.replaceChildren();
  box.hidden = false;

  const summary = document.createElement('div');
  summary.className = 'csv-import-summary';
  const items: { label: string; value: number; cls: string }[] = [
    { label: t('admin.excel_import_stat_created'), value: result.created, cls: 'success' },
    { label: t('admin.excel_import_stat_skipped'), value: result.skipped, cls: 'warning' },
  ];
  for (const item of items) {
    const span = document.createElement('span');
    span.className = `csv-import-stat csv-import-stat-${item.cls}`;
    span.textContent = `${item.label}: ${String(item.value)}`;
    summary.appendChild(span);
  }
  box.appendChild(summary);

  if (result.errors.length > 0) {
    const errHeading = document.createElement('h4');
    errHeading.textContent = t('admin.excel_import_errors_heading').replace(
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

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
