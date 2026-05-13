/**
 * Admin: bulk-upload van royalty-statement-PDFs.
 *
 * Verwacht NetSuite-filename-conventie `NU_SC_<alliantId>_<naam>_<YYYYMM>.pdf`
 * plus een Excel met bedragen (`alliant_id, amount, yyyymm`). Auteur wordt
 * gematcht op `authors.alliant_id`; statement-rij komt in `payments` en de
 * PDF in de `statements`-bucket.
 *
 * Flow:
 *   1. Modal: type-dropdown, multi-PDF-input, Excel-input, "Voorbeeld tonen".
 *   2. Parse → batch-lookup auteurs + duplicate-check → preview-tabel.
 *   3. Admin bevestigt → upload met max 4 parallel.
 *   4. Result-modal: succes/skipped/failed met per-rij-details.
 *
 * @module views/admin/bulk-statement-upload
 */

import type * as XLSXNamespace from 'xlsx';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n';
import type { PaymentType } from '@/types/db';
import {
  parseStatementFilename,
  parseBedragenExcel,
  lookupAmount,
  buildMonthTitle,
} from '@/lib/bulk-statement-helpers';
import {
  MAX_FILE_BYTES,
  buildStoragePath,
  uploadStatementFile,
  insertPaymentRecord,
  removeStatementFile,
} from '@/lib/statement-upload-core';

const MAX_TOTAL_BATCH_BYTES = 250 * 1024 * 1024; // soft-warning grens
const UPLOAD_CONCURRENCY = 4;

interface AuthorMatch {
  id: string;
  alliant_id: string | null;
  first_name: string;
  last_name: string;
}

type RowStatus =
  | { kind: 'ready'; amount: number; title_nl: string; title_en: string }
  | { kind: 'duplicate'; reason: string }
  | { kind: 'error'; reason: string };

interface PreviewRow {
  file: File;
  filename: string;
  alliantId: string;
  displayName: string;
  year: number;
  month: number;
  yyyymm: string;
  authorId: string | null;
  authorLabel: string;
  status: RowStatus;
}

const TYPE_OPTIONS: { value: PaymentType; labelKey: string }[] = [
  { value: 'royalty', labelKey: 'admin.bulk_stmt_type_royalty' },
  { value: 'subsidiary', labelKey: 'admin.bulk_stmt_type_subsidiary' },
  { value: 'foreign', labelKey: 'admin.bulk_stmt_type_foreign' },
  { value: 'jaaropgave', labelKey: 'admin.bulk_stmt_type_jaaropgave' },
];

export function openBulkStatementUploadModal(onDone: () => void): void {
  if (document.querySelector('.modal-overlay.bulk-stmt-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay bulk-stmt-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-import-modal bulk-stmt-modal';
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
  heading.textContent = t('admin.bulk_stmt_heading');
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.bulk_stmt_intro');
  modal.appendChild(intro);

  // -- Type-dropdown
  const typeWrap = document.createElement('label');
  typeWrap.className = 'auth-field';
  const typeSpan = document.createElement('span');
  typeSpan.textContent = t('admin.bulk_stmt_type_label');
  typeWrap.appendChild(typeSpan);
  const typeSelect = document.createElement('select');
  typeSelect.name = 'type';
  for (const opt of TYPE_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = t(opt.labelKey as Parameters<typeof t>[0]);
    typeSelect.appendChild(o);
  }
  typeWrap.appendChild(typeSelect);
  modal.appendChild(typeWrap);

  // -- PDF-input (multi)
  const pdfWrap = document.createElement('label');
  pdfWrap.className = 'auth-field';
  const pdfSpan = document.createElement('span');
  pdfSpan.textContent = t('admin.bulk_stmt_pdf_label');
  pdfWrap.appendChild(pdfSpan);
  const pdfInput = document.createElement('input');
  pdfInput.type = 'file';
  pdfInput.accept = 'application/pdf,.pdf';
  pdfInput.multiple = true;
  pdfInput.required = true;
  pdfWrap.appendChild(pdfInput);
  modal.appendChild(pdfWrap);

  // -- Excel-input (bedragen)
  const xlsxWrap = document.createElement('label');
  xlsxWrap.className = 'auth-field';
  const xlsxSpan = document.createElement('span');
  xlsxSpan.textContent = t('admin.bulk_stmt_amounts_label');
  xlsxWrap.appendChild(xlsxSpan);
  const xlsxInput = document.createElement('input');
  xlsxInput.type = 'file';
  xlsxInput.accept =
    '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
  xlsxInput.required = true;
  xlsxWrap.appendChild(xlsxInput);
  modal.appendChild(xlsxWrap);

  // -- Status
  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  modal.appendChild(status);

  // -- Preview-container
  const preview = document.createElement('div');
  preview.className = 'bulk-stmt-preview';
  preview.hidden = true;
  modal.appendChild(preview);

  // -- Result-container
  const resultBox = document.createElement('div');
  resultBox.className = 'csv-import-result';
  resultBox.hidden = true;
  modal.appendChild(resultBox);

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'auth-submit';
  previewBtn.textContent = t('admin.bulk_stmt_preview_btn');
  modal.appendChild(previewBtn);

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

  previewBtn.addEventListener('click', () => {
    const pdfs = pdfInput.files;
    const xlsx = xlsxInput.files?.[0];
    if (pdfs === null || pdfs.length === 0) {
      showStatus(status, 'error', t('admin.bulk_stmt_no_pdfs'));
      return;
    }
    if (xlsx === undefined) {
      showStatus(status, 'error', t('admin.bulk_stmt_no_amounts'));
      return;
    }
    void runPreview(Array.from(pdfs), xlsx, typeSelect.value as PaymentType, {
      previewBtn,
      status,
      preview,
      resultBox,
    });
  });

  document.body.appendChild(overlay);
}

// ============================================================================
// Preview-stap
// ============================================================================
async function runPreview(
  pdfs: File[],
  xlsx: File,
  type: PaymentType,
  ui: {
    previewBtn: HTMLButtonElement;
    status: HTMLElement;
    preview: HTMLElement;
    resultBox: HTMLElement;
  }
): Promise<void> {
  ui.status.hidden = true;
  ui.preview.hidden = true;
  ui.resultBox.hidden = true;
  setBusy(ui.previewBtn, true);
  ui.previewBtn.textContent = t('common.loading');

  try {
    // Filesize-validaties
    let totalBytes = 0;
    for (const f of pdfs) {
      if (f.size > MAX_FILE_BYTES) {
        showStatus(
          ui.status,
          'error',
          t('admin.bulk_stmt_pdf_too_large')
            .replace('{file}', f.name)
            .replace('{max}', String(MAX_FILE_BYTES / 1024 / 1024))
        );
        resetPreviewBtn(ui.previewBtn);
        return;
      }
      totalBytes += f.size;
    }
    if (totalBytes > MAX_TOTAL_BATCH_BYTES) {
      showStatus(
        ui.status,
        'warning',
        t('admin.bulk_stmt_batch_too_large').replace(
          '{mb}',
          String(Math.round(totalBytes / 1024 / 1024))
        )
      );
      // Niet hard blokkeren — alleen waarschuwen.
    }

    // Excel parsen
    const buffer = await xlsx.arrayBuffer();
    const XLSX = await import('xlsx');
    const bedragen = parseBedragenExcel(buffer, XLSX);
    if (!(bedragen instanceof Map)) {
      showStatus(ui.status, 'error', bedragen.error);
      resetPreviewBtn(ui.previewBtn);
      return;
    }

    // PDF-filenames parsen
    const rows: PreviewRow[] = pdfs.map((file) => {
      const parsed = parseStatementFilename(file.name);
      if ('error' in parsed) {
        return makeErrorRow(file, parsed.error);
      }
      return {
        file,
        filename: file.name,
        alliantId: parsed.alliantId,
        displayName: parsed.displayName,
        year: parsed.year,
        month: parsed.month,
        yyyymm: parsed.yyyymm,
        authorId: null,
        authorLabel: parsed.displayName,
        status: { kind: 'error', reason: '' }, // tijdelijk; overschreven hieronder
      };
    });

    // Batch-query auteurs op alliant_id
    const uniqueAlliantIds = Array.from(
      new Set(rows.filter((r) => r.alliantId !== '').map((r) => r.alliantId))
    );
    const authorByAlliant = await fetchAuthorsByAlliantId(uniqueAlliantIds);

    // Bepaal target-pad + duplicate-check in één batch
    const targetPaths: string[] = [];
    for (const row of rows) {
      if (row.alliantId === '') {
        continue;
      }
      const author = authorByAlliant.get(row.alliantId);
      if (author === undefined) {
        continue;
      }
      row.authorId = author.id;
      row.authorLabel = `${author.first_name} ${author.last_name}`;
      targetPaths.push(buildStoragePath(author.id, type, row.year, row.filename));
    }

    const existingPaths = await fetchExistingPaymentPaths(targetPaths);

    // Status per rij invullen
    for (const row of rows) {
      // Filename-parsing-fout: status was al gezet door makeErrorRow
      if (row.alliantId === '') {
        continue;
      }

      const author = authorByAlliant.get(row.alliantId);
      if (author === undefined) {
        row.status = {
          kind: 'error',
          reason: t('admin.bulk_stmt_status_no_author').replace('{id}', row.alliantId),
        };
        continue;
      }

      const path = buildStoragePath(author.id, type, row.year, row.filename);
      if (existingPaths.has(path)) {
        row.status = {
          kind: 'duplicate',
          reason: t('admin.bulk_stmt_status_duplicate'),
        };
        continue;
      }

      const amount = lookupAmount(bedragen, row.alliantId, row.yyyymm);
      if (amount === null) {
        row.status = {
          kind: 'error',
          reason: t('admin.bulk_stmt_status_no_amount').replace('{id}', row.alliantId),
        };
        continue;
      }

      row.status = {
        kind: 'ready',
        amount,
        title_nl: buildMonthTitle(type, row.year, row.month, 'nl'),
        title_en: buildMonthTitle(type, row.year, row.month, 'en'),
      };
    }

    renderPreview(ui.preview, rows, type, ui.resultBox);
    resetPreviewBtn(ui.previewBtn);
    ui.previewBtn.textContent = t('admin.bulk_stmt_re_preview_btn');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showStatus(ui.status, 'error', `${t('admin.bulk_stmt_unexpected')}: ${message}`);
    resetPreviewBtn(ui.previewBtn);
  }
}

function makeErrorRow(file: File, reason: string): PreviewRow {
  return {
    file,
    filename: file.name,
    alliantId: '',
    displayName: '',
    year: 0,
    month: 0,
    yyyymm: '',
    authorId: null,
    authorLabel: '—',
    status: { kind: 'error', reason },
  };
}

// ============================================================================
// Auteur + duplicate lookups
// ============================================================================
async function fetchAuthorsByAlliantId(alliantIds: string[]): Promise<Map<string, AuthorMatch>> {
  const result = new Map<string, AuthorMatch>();
  if (alliantIds.length === 0) {
    return result;
  }
  const { data, error } = await supabase
    .from('authors')
    .select('id, alliant_id, first_name, last_name')
    .in('alliant_id', alliantIds);
  if (error !== null) {
    reportError('bulkStatement.fetchAuthors', error);
    return result;
  }
  for (const row of data) {
    if (row.alliant_id !== null) {
      result.set(row.alliant_id, row);
    }
  }
  return result;
}

async function fetchExistingPaymentPaths(paths: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (paths.length === 0) {
    return result;
  }
  // Supabase `.in()` accepteert tot ~1000 items; bij grotere batches chunken.
  const CHUNK = 500;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('payments')
      .select('file_path')
      .in('file_path', slice);
    if (error !== null) {
      reportError('bulkStatement.fetchExisting', error);
      continue;
    }
    for (const row of data) {
      if (row.file_path !== null) {
        result.add(row.file_path);
      }
    }
  }
  return result;
}

// ============================================================================
// Preview-tabel rendering
// ============================================================================
function renderPreview(
  container: HTMLElement,
  rows: PreviewRow[],
  type: PaymentType,
  resultBox: HTMLElement
): void {
  container.replaceChildren();
  container.hidden = false;
  resultBox.hidden = true;

  const summary = document.createElement('p');
  const readyCount = rows.filter((r) => r.status.kind === 'ready').length;
  const dupCount = rows.filter((r) => r.status.kind === 'duplicate').length;
  const errCount = rows.filter((r) => r.status.kind === 'error').length;
  summary.className = 'bulk-stmt-summary';
  summary.textContent = t('admin.bulk_stmt_preview_summary')
    .replace('{ready}', String(readyCount))
    .replace('{duplicate}', String(dupCount))
    .replace('{error}', String(errCount));
  container.appendChild(summary);

  // Tabel
  const table = document.createElement('table');
  table.className = 'bulk-stmt-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const key of [
    'admin.bulk_stmt_col_filename',
    'admin.bulk_stmt_col_alliant',
    'admin.bulk_stmt_col_author',
    'admin.bulk_stmt_col_period',
    'admin.bulk_stmt_col_amount',
    'admin.bulk_stmt_col_status',
  ] as const) {
    const th = document.createElement('th');
    th.textContent = t(key);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = `bulk-stmt-row bulk-stmt-row-${row.status.kind}`;

    appendCell(tr, row.filename);
    appendCell(tr, row.alliantId === '' ? '—' : row.alliantId);
    appendCell(tr, row.authorLabel);
    appendCell(
      tr,
      row.yyyymm === '' ? '—' : `${String(row.year)}-${String(row.month).padStart(2, '0')}`
    );

    const amountCell = document.createElement('td');
    if (row.status.kind === 'ready') {
      amountCell.textContent = formatEuro(row.status.amount);
    } else {
      amountCell.textContent = '—';
    }
    tr.appendChild(amountCell);

    const statusCell = document.createElement('td');
    statusCell.className = `bulk-stmt-status bulk-stmt-status-${row.status.kind}`;
    statusCell.textContent = formatStatus(row.status);
    tr.appendChild(statusCell);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);

  // Upload-knop
  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'auth-submit bulk-stmt-upload-btn';
  uploadBtn.textContent = t('admin.bulk_stmt_upload_btn').replace('{count}', String(readyCount));
  uploadBtn.disabled = readyCount === 0;
  container.appendChild(uploadBtn);

  uploadBtn.addEventListener('click', () => {
    void runUpload(rows, type, uploadBtn, resultBox, container);
  });
}

function appendCell(tr: HTMLElement, text: string): void {
  const td = document.createElement('td');
  td.textContent = text;
  tr.appendChild(td);
}

function formatStatus(status: RowStatus): string {
  switch (status.kind) {
    case 'ready':
      return t('admin.bulk_stmt_status_ready');
    case 'duplicate':
      return status.reason;
    case 'error':
      return status.reason;
  }
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

// ============================================================================
// Upload-fase
// ============================================================================
interface UploadResult {
  succeeded: number;
  skipped: number;
  failed: number;
  errors: { filename: string; reason: string }[];
}

async function runUpload(
  rows: PreviewRow[],
  type: PaymentType,
  uploadBtn: HTMLButtonElement,
  resultBox: HTMLElement,
  previewBox: HTMLElement
): Promise<void> {
  const targets = rows.filter((r) => r.status.kind === 'ready');
  if (targets.length === 0) {
    return;
  }

  setBusy(uploadBtn, true);
  uploadBtn.textContent = t('admin.bulk_stmt_uploading');

  const result: UploadResult = { succeeded: 0, skipped: 0, failed: 0, errors: [] };

  // Process in chunks van CONCURRENCY zodat we niet 50 simultane uploads doen.
  for (let i = 0; i < targets.length; i += UPLOAD_CONCURRENCY) {
    const chunk = targets.slice(i, i + UPLOAD_CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((row) => uploadOneRow(row, type, result)));
    // Promise.allSettled-rejecties zouden niet mogen voorkomen omdat we
    // intern al try/catch doen, maar voor de zekerheid:
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      const row = chunk[j];
      if (s === undefined || row === undefined) {
        continue;
      }
      if (s.status === 'rejected') {
        result.failed++;
        result.errors.push({ filename: row.filename, reason: String(s.reason) });
      }
    }
  }

  renderResult(resultBox, result);
  previewBox.hidden = true;
  uploadBtn.remove();
}

async function uploadOneRow(
  row: PreviewRow,
  type: PaymentType,
  result: UploadResult
): Promise<void> {
  if (row.status.kind !== 'ready' || row.authorId === null) {
    return;
  }
  const path = buildStoragePath(row.authorId, type, row.year, row.filename);

  // 1. Upload PDF
  const upload = await uploadStatementFile(row.file, path);
  if (!upload.ok) {
    if (upload.duplicate === true) {
      // Bestand bestaat al — interpreteer als duplicate (zou normaal door
      // de preview-check zijn gevangen, maar kan voorkomen als 2 admins
      // parallel uploaden).
      result.skipped++;
      result.errors.push({
        filename: row.filename,
        reason: t('admin.bulk_stmt_status_duplicate'),
      });
      return;
    }
    result.failed++;
    result.errors.push({
      filename: row.filename,
      reason: upload.error ?? 'upload failed',
    });
    return;
  }

  // 2. INSERT payments
  const insert = await insertPaymentRecord({
    author_id: row.authorId,
    type,
    year: row.year,
    amount: row.status.amount,
    title_nl: row.status.title_nl,
    title_en: row.status.title_en,
    payment_date: `${String(row.year)}-${String(row.month).padStart(2, '0')}-01`,
    file_path: path,
  });

  if (insert === 'created') {
    result.succeeded++;
    return;
  }
  if (insert === 'duplicate') {
    // Race-conditie: storage-upload slaagde maar payments-rij bestond al.
    // PDF was nieuw geüpload — niet weghalen want bijbehorende rij bestaat.
    result.skipped++;
    return;
  }
  // Andere INSERT-fout: PDF in storage opruimen, geen wees-bestand.
  await removeStatementFile(path);
  result.failed++;
  result.errors.push({ filename: row.filename, reason: insert.error });
}

// ============================================================================
// Result-rendering
// ============================================================================
function renderResult(box: HTMLElement, result: UploadResult): void {
  box.replaceChildren();
  box.hidden = false;

  const summary = document.createElement('div');
  summary.className = 'csv-import-summary';
  const items: { label: string; value: number; cls: string }[] = [
    { label: t('admin.bulk_stmt_result_succeeded'), value: result.succeeded, cls: 'success' },
    { label: t('admin.bulk_stmt_result_skipped'), value: result.skipped, cls: 'warning' },
    { label: t('admin.bulk_stmt_result_failed'), value: result.failed, cls: 'error' },
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
    errHeading.textContent = t('admin.bulk_stmt_result_errors_heading').replace(
      '{count}',
      String(result.errors.length)
    );
    box.appendChild(errHeading);

    const list = document.createElement('ul');
    list.className = 'csv-import-errors';
    for (const err of result.errors) {
      const li = document.createElement('li');
      li.textContent = `${err.filename}: ${err.reason}`;
      list.appendChild(li);
    }
    box.appendChild(list);
  }
}

// ============================================================================
// UI-helpers
// ============================================================================
function showStatus(
  box: HTMLElement,
  kind: 'error' | 'success' | 'warning',
  message: string
): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}

function setBusy(btn: HTMLElement, busy: boolean): void {
  if (busy) {
    btn.setAttribute('disabled', 'disabled');
    btn.setAttribute('aria-busy', 'true');
  } else {
    btn.removeAttribute('disabled');
    btn.removeAttribute('aria-busy');
  }
}

function resetPreviewBtn(btn: HTMLButtonElement): void {
  btn.removeAttribute('disabled');
  btn.removeAttribute('aria-busy');
}

// Type-imports verwijzen alleen naar types; runtime-import vermeden om de
// bundle klein te houden (xlsx wordt lazy geladen in runPreview).
void (null as unknown as typeof XLSXNamespace);
