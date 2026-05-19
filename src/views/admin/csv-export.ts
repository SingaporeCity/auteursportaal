/**
 * Admin: Excel-export van goedgekeurde change-requests die nog niet
 * eerder zijn ge-exporteerd.
 *
 * Flow:
 *   1. Modal opent → query `change_requests` waar status='approved' en
 *      exported_at IS NULL, joined met auteur-naam + alliant_id en
 *      goedkeurder (= admin-user).
 *   2. Toon preview-lijst (eerste 50 rijen + count).
 *   3. Admin klikt "Exporteer" → genereer .xlsx client-side via SheetJS,
 *      trigger download, en UPDATE `exported_at = NOW()` op de
 *      ge-exporteerde rijen.
 *   4. Bij volgende open: alleen rijen die ná deze export goedgekeurd
 *      zijn verschijnen weer.
 *
 * Vervangt de oude `export-authors-csv` Edge Function-flow — die werd
 * gebruikt om volledige auteur-rijen te exporteren. De nieuwe flow
 * exporteert per-veld-deltas die makkelijker in NetSuite te verwerken zijn.
 *
 * @module views/admin/csv-export
 */

import type * as XLSXNamespace from 'xlsx';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';

interface ChangeRow {
  id: string;
  author_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  processed_at: string | null;
  processed_by: string | null;
}

interface ExportRow {
  authorName: string;
  alliantId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  approvedBy: string;
  approvedAt: string;
  // Voor de UPDATE na succesvolle download
  _changeRequestId: string;
}

export function openCsvExportModal(onDone: () => void): void {
  if (document.querySelector('.modal-overlay.csv-export-overlay') !== null) {
    return;
  }

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
  heading.textContent = t('admin.csv_export_heading');
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.csv_export_intro');
  modal.appendChild(intro);

  // Preview-block (vult zich na load)
  const preview = document.createElement('div');
  preview.className = 'csv-export-preview';
  preview.textContent = t('common.loading');
  modal.appendChild(preview);

  // Status + result
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
  submit.textContent = t('admin.csv_export_submit');
  submit.disabled = true;
  modal.appendChild(submit);

  let rows: ExportRow[] = [];

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
    void runExport(rows, submit, status, successBox, preview);
  });

  document.body.appendChild(overlay);

  // Async load → fill preview + enable submit
  void loadChanges().then((loaded) => {
    rows = loaded;
    renderPreview(preview, rows);
    submit.textContent = t('admin.csv_export_submit_count').replace('{count}', String(rows.length));
    submit.disabled = rows.length === 0;
  });
}

async function loadChanges(): Promise<ExportRow[]> {
  const { data: changes, error } = await supabase
    .from('change_requests')
    .select('id, author_id, field_name, old_value, new_value, processed_at, processed_by')
    .eq('status', 'approved')
    // exported_at-filter via `.filter()` ipv `.is()` zodat we niet
    // afhangen van regeneratie van de DB-types na migratie 0018.
    .filter('exported_at', 'is', null)
    .order('processed_at', { ascending: true });

  if (error !== null) {
    reportError('admin.csvExport.loadChanges', error);
    return [];
  }
  if (changes.length === 0) {
    return [];
  }

  // Batch-fetch auteur-info én admins (= processed_by)
  const allIds = new Set<string>();
  for (const c of changes) {
    allIds.add(c.author_id);
    if (c.processed_by !== null) {
      allIds.add(c.processed_by);
    }
  }
  const { data: people } = await supabase
    .from('authors')
    .select('id, first_name, last_name, alliant_id, netsuite_vendor_id')
    .in('id', [...allIds]);

  const personMap = new Map<
    string,
    { first_name: string; last_name: string; alliant_id: string | null }
  >();
  people?.forEach((p) => {
    personMap.set(p.id, p);
  });

  return changes.map((c: ChangeRow) => {
    const author = personMap.get(c.author_id);
    const admin = c.processed_by !== null ? personMap.get(c.processed_by) : undefined;
    return {
      authorName:
        author !== undefined ? `${author.first_name} ${author.last_name}`.trim() : c.author_id,
      alliantId: author?.alliant_id ?? '',
      fieldName: c.field_name,
      oldValue: c.old_value ?? '',
      newValue: c.new_value ?? '',
      approvedBy:
        admin !== undefined
          ? `${admin.first_name} ${admin.last_name}`.trim()
          : (c.processed_by ?? ''),
      approvedAt: c.processed_at ?? '',
      _changeRequestId: c.id,
    };
  });
}

function renderPreview(container: HTMLElement, rows: ExportRow[]): void {
  container.replaceChildren();

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'csv-export-empty';
    empty.textContent = t('admin.csv_export_no_changes');
    container.appendChild(empty);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'csv-export-summary';
  summary.textContent = t('admin.csv_export_summary_count').replace('{count}', String(rows.length));
  container.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'csv-export-row-list';
  for (const row of rows.slice(0, 50)) {
    const li = document.createElement('li');
    li.textContent = `${row.authorName} — ${row.fieldName}: "${row.oldValue}" → "${row.newValue}"`;
    list.appendChild(li);
  }
  if (rows.length > 50) {
    const more = document.createElement('li');
    more.className = 'csv-export-row-more';
    more.textContent = t('admin.csv_export_row_more').replace('{count}', String(rows.length - 50));
    list.appendChild(more);
  }
  container.appendChild(list);
}

async function runExport(
  rows: ExportRow[],
  submit: HTMLButtonElement,
  status: HTMLElement,
  successBox: HTMLElement,
  preview: HTMLElement
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  submit.disabled = true;
  submit.textContent = t('common.busy');
  status.hidden = true;
  successBox.hidden = true;

  try {
    // Bouw + download Excel
    const XLSX = await import('xlsx');
    const buffer = buildExportWorkbook(XLSX, rows);
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, `wijzigingen-export-${stamp}.xlsx`);

    // Markeer rijen als ge-exporteerd (admin moet dit ZIEN omdat de
    // volgende keer dat hij de modal opent ze niet meer in de lijst staan)
    const ids = rows.map((r) => r._changeRequestId);
    // exported_at is gegenereerd in migratie 0018 maar zit nog niet in de
    // gegenereerde DB-types — cast om de TS-error te omzeilen tot de
    // types geregeneerd zijn na deploy.
    const updatePayload: Record<string, string> = { exported_at: new Date().toISOString() };
    const { error: updErr } = await supabase
      .from('change_requests')
      .update(updatePayload as never)
      .in('id', ids);
    if (updErr !== null) {
      reportError('admin.csvExport.markExported', updErr);
      showStatus(status, 'error', `Export gedownload maar markering faalde: ${updErr.message}`);
      submit.disabled = false;
      submit.textContent = t('admin.csv_export_submit');
      return;
    }

    // Succes-bevestiging
    successBox.hidden = false;
    successBox.replaceChildren();
    const ok = document.createElement('div');
    ok.className = 'csv-export-success-heading';
    ok.textContent = t('admin.csv_export_success_heading');
    successBox.appendChild(ok);

    const meta = document.createElement('p');
    meta.className = 'csv-export-success-meta';
    meta.textContent = `${String(rows.length)} wijzigingen — wijzigingen-export-${stamp}.xlsx`;
    successBox.appendChild(meta);

    const sub = document.createElement('p');
    sub.className = 'csv-export-success-text';
    sub.textContent = t('admin.csv_export_success_text');
    successBox.appendChild(sub);

    // Lege preview omdat de export-rijen nu verwerkt zijn
    preview.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'csv-export-empty';
    empty.textContent = t('admin.csv_export_no_changes');
    preview.appendChild(empty);

    submit.textContent = t('common.close');
    submit.disabled = false;
    submit.replaceWith(submit.cloneNode(true));
    const fresh = successBox.parentElement?.querySelector<HTMLButtonElement>('.auth-submit');
    fresh?.addEventListener('click', () => {
      const overlay = document.querySelector<HTMLElement>('.csv-export-overlay');
      overlay?.remove();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportError('admin.csvExport', new Error(message));
    showStatus(status, 'error', `Onverwachte fout: ${message}`);
    submit.disabled = false;
    submit.textContent = t('admin.csv_export_submit');
  }
}

/**
 * Bouwt het export-workbook met één werkblad "Wijzigingen". Rijen zijn
 * per-veld-deltas die admin handmatig in NetSuite (of een ander
 * back-office systeem) kan inlezen. Kolomvolgorde matched wat de
 * AskUserQuestion-keuze definieerde.
 */
function buildExportWorkbook(XLSX: typeof XLSXNamespace, rows: ExportRow[]): ArrayBuffer {
  const data: (string | number)[][] = [
    [
      'Auteur',
      'Alliant ID',
      'Veld',
      'Oude waarde',
      'Nieuwe waarde',
      'Goedgekeurd door',
      'Goedgekeurd op',
    ],
  ];
  for (const r of rows) {
    data.push([
      r.authorName,
      r.alliantId,
      r.fieldName,
      r.oldValue,
      r.newValue,
      r.approvedBy,
      r.approvedAt,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Wijzigingen');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
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

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
