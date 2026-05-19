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
  derivePaymentDate,
  TYPE_TO_PREFIX,
  buildBedragenTemplate,
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

export function openBulkStatementUploadModal(onDone: () => void, type: PaymentType): void {
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

  // Type is al gekozen in de Documenten-uploaden choice-modal; geen
  // dropdown meer hier. Heading bevat het type-label zodat de admin
  // ziet welke modus actief is.
  const typeLabel = t(`admin.bulk_stmt_type_${type}`);
  const heading = document.createElement('h3');
  heading.textContent = t('admin.bulk_stmt_heading').replace('{type}', typeLabel);
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.bulk_stmt_intro');
  modal.appendChild(intro);

  // -- Filename-conventie-help (collapsible). Standaard ingeklapt zodat
  // de modal niet overspoeld lijkt; admin klikt om uit te klappen.
  const conventionHelp = document.createElement('details');
  conventionHelp.className = 'bulk-stmt-convention-help';
  modal.appendChild(conventionHelp);
  renderFilenameConvention(conventionHelp, type);

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

  // -- Help-blok voor de bedragen-Excel: super-eenvoudige uitleg + voor-
  // beeldtabel + download-knop voor leeg template. Helpt een nieuwe admin
  // in één oogopslag zien wat we nodig hebben.
  modal.appendChild(buildAmountsHelp());

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
    void runPreview(Array.from(pdfs), xlsx, type, {
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

    // PDF-filenames parsen — geef het verwachte type mee zodat een
    // verkeerde prefix (bv. NR-bestand bij Royalty-selectie) een
    // duidelijke type-mismatch-error oplevert ipv stilzwijgend te slagen.
    const rows: PreviewRow[] = pdfs.map((file) => {
      const parsed = parseStatementFilename(file.name, type);
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
    // Voorbeeldweergave-knop is na een geslaagde render niet meer relevant —
    // de gebruiker gaat door met "Upload N statements" of sluit de modal.
    ui.previewBtn.hidden = true;
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
// Preview-rendering — stat-tiles + gegroepeerde sectie-cards
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

  const ready = rows.filter((r) => r.status.kind === 'ready');
  const duplicates = rows.filter((r) => r.status.kind === 'duplicate');
  const errors = rows.filter((r) => r.status.kind === 'error');

  // -- Stat-tiles bovenaan: drie tegels met aantallen, kleur-gecodeerd
  const stats = document.createElement('div');
  stats.className = 'bulk-stmt-stats';
  stats.appendChild(buildStatTile('ready', ready.length, t('admin.bulk_stmt_group_ready')));
  stats.appendChild(
    buildStatTile('duplicate', duplicates.length, t('admin.bulk_stmt_group_duplicate'))
  );
  stats.appendChild(buildStatTile('error', errors.length, t('admin.bulk_stmt_group_error')));
  container.appendChild(stats);

  // -- Groepen per status; alleen tonen wanneer er rijen in zitten
  if (ready.length > 0) {
    container.appendChild(buildPreviewGroup('ready', ready));
  }
  if (duplicates.length > 0) {
    container.appendChild(buildPreviewGroup('duplicate', duplicates));
  }
  if (errors.length > 0) {
    container.appendChild(buildPreviewGroup('error', errors));
  }

  // -- Upload-knop onderaan
  const uploadBtn = document.createElement('button');
  uploadBtn.type = 'button';
  uploadBtn.className = 'auth-submit bulk-stmt-upload-btn';
  uploadBtn.textContent = t('admin.bulk_stmt_upload_btn').replace('{count}', String(ready.length));
  uploadBtn.disabled = ready.length === 0;
  container.appendChild(uploadBtn);

  uploadBtn.addEventListener('click', () => {
    void runUpload(rows, type, uploadBtn, resultBox, container);
  });
}

function buildStatTile(kind: RowStatus['kind'], count: number, label: string): HTMLElement {
  const tile = document.createElement('div');
  tile.className = `bulk-stmt-stat bulk-stmt-stat--${kind}`;

  const num = document.createElement('span');
  num.className = 'bulk-stmt-stat-num';
  num.textContent = String(count);
  tile.appendChild(num);

  const lbl = document.createElement('span');
  lbl.className = 'bulk-stmt-stat-label';
  lbl.textContent = label;
  tile.appendChild(lbl);

  return tile;
}

function buildPreviewGroup(kind: RowStatus['kind'], rows: PreviewRow[]): HTMLElement {
  const section = document.createElement('section');
  section.className = `bulk-stmt-group bulk-stmt-group--${kind}`;

  const header = document.createElement('h4');
  header.className = 'bulk-stmt-group-heading';

  const dot = document.createElement('span');
  dot.className = `bulk-stmt-group-dot bulk-stmt-group-dot--${kind}`;
  header.appendChild(dot);

  const titleSpan = document.createElement('span');
  switch (kind) {
    case 'ready':
      titleSpan.textContent = t('admin.bulk_stmt_group_ready');
      break;
    case 'duplicate':
      titleSpan.textContent = t('admin.bulk_stmt_group_duplicate');
      break;
    case 'error':
      titleSpan.textContent = t('admin.bulk_stmt_group_error');
      break;
  }
  header.appendChild(titleSpan);

  const count = document.createElement('span');
  count.className = 'bulk-stmt-group-count';
  count.textContent = `(${String(rows.length)})`;
  header.appendChild(count);

  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'bulk-stmt-items';
  for (const row of rows) {
    list.appendChild(buildPreviewItem(row));
  }
  section.appendChild(list);

  return section;
}

function buildPreviewItem(row: PreviewRow): HTMLElement {
  const item = document.createElement('div');
  item.className = `bulk-stmt-item bulk-stmt-item--${row.status.kind}`;

  // Linker-kolom: auteur naam (groot) + bestandsnaam + periode (klein/mono)
  const left = document.createElement('div');
  left.className = 'bulk-stmt-item-main';

  const name = document.createElement('div');
  name.className = 'bulk-stmt-item-name';
  name.textContent = row.authorLabel !== '' ? row.authorLabel : '—';
  left.appendChild(name);

  const sub = document.createElement('div');
  sub.className = 'bulk-stmt-item-sub';
  const subParts: string[] = [row.filename];
  if (row.year > 0 && row.month > 0) {
    subParts.push(formatPeriod(row.year, row.month));
  }
  sub.textContent = subParts.join(' · ');
  left.appendChild(sub);

  // Reden bij duplicate/error apart op een derde regel zodat de hoofdinfo
  // niet doorbreekt
  if (row.status.kind !== 'ready') {
    const reason = document.createElement('div');
    reason.className = 'bulk-stmt-item-reason';
    reason.textContent = row.status.reason;
    left.appendChild(reason);
  }

  item.appendChild(left);

  // Rechter-kolom: bedrag (alleen bij ready)
  const right = document.createElement('div');
  right.className = 'bulk-stmt-item-amount';
  if (row.status.kind === 'ready') {
    right.textContent = formatEuro(row.status.amount);
  }
  item.appendChild(right);

  return item;
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat(getLocale() === 'en' ? 'en-US' : 'nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

function formatPeriod(year: number, month: number): string {
  const locale = getLocale() === 'en' ? 'en-US' : 'nl-NL';
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

/**
 * Rendert een prominent uitleg-blok in de bulk-upload-modal met de filename-
 * conventie voor het geselecteerde type. Wordt opnieuw aangeroepen bij elke
 * type-wissel zodat de prefix + voorbeeld direct meeschakelt.
 *
 * Doel: voorkom mislukte uploads door verkeerde naamgeving — admin ziet
 * vóór het slepen exact welk patroon nodig is, met een geel-gemarkeerd
 * voorbeeld dat hij kan copy-pasten als template.
 */
function renderFilenameConvention(container: HTMLElement, type: PaymentType): void {
  container.replaceChildren();
  const prefix = TYPE_TO_PREFIX[type];
  const typeLabel = t(`admin.bulk_stmt_type_${type}`);

  // <summary> is de klikbare header die het blok open/dicht klapt
  const summary = document.createElement('summary');
  summary.className = 'bulk-stmt-convention-heading';
  summary.textContent = t('admin.bulk_stmt_filename_heading').replace('{type}', typeLabel);
  container.appendChild(summary);

  // Format-regel: NU_<PREFIX>_<AlliantID>_<Voorletters Achternaam>_<YYYYMM>.pdf
  const format = document.createElement('code');
  format.className = 'bulk-stmt-convention-format';
  format.textContent = `NU_${prefix}_<AlliantID>_<Voorletters Achternaam>_<YYYYMM>.pdf`;
  container.appendChild(format);

  // Concreet voorbeeld om te kunnen copy-pasten
  const exampleWrap = document.createElement('div');
  exampleWrap.className = 'bulk-stmt-convention-example';
  const exampleLabel = document.createElement('span');
  exampleLabel.className = 'bulk-stmt-convention-example-label';
  exampleLabel.textContent = t('admin.bulk_stmt_filename_example_label');
  exampleWrap.appendChild(exampleLabel);
  const exampleCode = document.createElement('code');
  exampleCode.textContent = `NU_${prefix}_2651307_G. de Jong_202512.pdf`;
  exampleWrap.appendChild(exampleCode);
  container.appendChild(exampleWrap);

  // Legenda: per onderdeel uitleggen wat erin moet
  const legend = document.createElement('ul');
  legend.className = 'bulk-stmt-convention-legend';

  const items: { key: string; value: string }[] = [
    {
      key: `NU_${prefix}`,
      value: t('admin.bulk_stmt_filename_part_prefix').replace('{type}', typeLabel),
    },
    { key: '<AlliantID>', value: t('admin.bulk_stmt_filename_part_alliant') },
    { key: '<Voorletters Achternaam>', value: t('admin.bulk_stmt_filename_part_name') },
    { key: '<YYYYMM>', value: t('admin.bulk_stmt_filename_part_yyyymm') },
  ];
  for (const item of items) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = item.key;
    li.appendChild(code);
    const span = document.createElement('span');
    span.textContent = ` — ${item.value}`;
    li.appendChild(span);
    legend.appendChild(li);
  }
  container.appendChild(legend);
}

/**
 * Help-blok voor de bedragen-Excel (collapsible).
 * Toont:
 *   - Korte instructie: één rij per PDF
 *   - Een visuele voorbeeldtabel
 *   - Een download-knop voor een leeg template
 *
 * Het template wordt client-side gegenereerd met SheetJS op het moment
 * dat de admin klikt — geen statische .xlsx in de repo, en de structuur
 * kan niet uit sync raken met `parseBedragenExcel`.
 */
function buildAmountsHelp(): HTMLElement {
  const help = document.createElement('details');
  help.className = 'bulk-stmt-amounts-help';

  const summary = document.createElement('summary');
  summary.className = 'bulk-stmt-amounts-heading';
  summary.textContent = t('admin.bulk_stmt_amounts_help_heading');
  help.appendChild(summary);

  const intro = document.createElement('p');
  intro.className = 'bulk-stmt-amounts-intro';
  intro.textContent = t('admin.bulk_stmt_amounts_help_intro');
  help.appendChild(intro);

  // -- Voorbeeldtabel — één rij per PDF, alle kolommen gevuld
  const table = document.createElement('table');
  table.className = 'bulk-stmt-amounts-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of ['alliant_id', 'amount', 'yyyymm']) {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const exampleRows: string[][] = [
    ['2651307', '1250,50', '202512'],
    ['2651307', '980,00', '202506'],
    ['2644800', '2100,00', '202512'],
  ];
  for (const row of exampleRows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  help.appendChild(table);

  // -- Download-knop voor leeg template
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'bulk-stmt-amounts-download';
  downloadBtn.textContent = t('admin.bulk_stmt_amounts_download_btn');
  downloadBtn.addEventListener('click', () => {
    void downloadBedragenTemplate(downloadBtn);
  });
  help.appendChild(downloadBtn);

  return help;
}

async function downloadBedragenTemplate(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  try {
    const XLSX = await import('xlsx');
    const buffer = buildBedragenTemplate(XLSX);
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Bedragen-template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false;
  }
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
    payment_date: derivePaymentDate(type, row.year, row.month),
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
