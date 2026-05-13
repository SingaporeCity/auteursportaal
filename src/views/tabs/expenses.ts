/**
 * Declaraties-tab — formulier-downloaden + ingevuld PDF uploaden + historie.
 *
 * Stappen voor de auteur:
 *   1. Download een formulier (Onkosten of IDC) — Excel-bestand uit
 *      `public/forms/`.
 *   2. Vul het in op je computer, sla op als PDF.
 *   3. Upload de PDF + kies het bijbehorende type → auto-mail naar
 *      `rights@noordhoff.nl` met de PDF als attachment, EN de declaratie
 *      wordt opgeslagen in de DB zodat 'ie ook in "Ingediende declaraties"
 *      verschijnt.
 *
 * @module views/tabs/expenses
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import { extractFnError, formatFnErrorMessage } from '@/lib/edge-function-errors';
import type { AuthorRow } from '@/auth';
import type { Database, ExpenseStatus, ExpenseType } from '@/types/db';

type ExpenseRow = Database['public']['Tables']['expenses']['Row'];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const STATUS_LABEL: Record<ExpenseStatus, Parameters<typeof t>[0]> = {
  pending: 'expenses.status_pending',
  approved: 'expenses.status_approved',
  rejected: 'expenses.status_rejected',
  paid: 'expenses.status_paid',
};

interface FormSpec {
  type: ExpenseType;
  titleKey: Parameters<typeof t>[0];
  descKey: Parameters<typeof t>[0];
  explanationKey: Parameters<typeof t>[0];
  filename: string;
  requiredHintKey?: Parameters<typeof t>[0];
}

const FORMS: FormSpec[] = [
  {
    type: 'onkosten',
    titleKey: 'expenses.form_onkosten_title',
    descKey: 'expenses.form_onkosten_desc',
    explanationKey: 'expenses.form_onkosten_explanation',
    filename: 'Declaratieformulier-Onkosten.xlsx',
  },
  {
    type: 'idc',
    titleKey: 'expenses.form_idc_title',
    descKey: 'expenses.form_idc_desc',
    explanationKey: 'expenses.form_idc_explanation',
    filename: 'Declaratieformulier-IDC.xlsx',
    requiredHintKey: 'expenses.form_idc_required_hint',
  },
];

const RULES: { titleKey: Parameters<typeof t>[0]; textKey: Parameters<typeof t>[0] }[] = [
  { titleKey: 'expenses.rule_originals_title', textKey: 'expenses.rule_originals_text' },
  { titleKey: 'expenses.rule_pdfonly_title', textKey: 'expenses.rule_pdfonly_text' },
  { titleKey: 'expenses.rule_km_title', textKey: 'expenses.rule_km_text' },
  { titleKey: 'expenses.rule_btw_title', textKey: 'expenses.rule_btw_text' },
];

export function renderExpensesTab(container: HTMLElement, author?: AuthorRow): void {
  const heading = document.createElement('h2');
  heading.textContent = t('expenses.new_title');
  container.appendChild(heading);

  // -- Stap 1: download het juiste formulier (+ uitleg)
  container.appendChild(buildFormSelector());

  // -- Vendor ID notice
  if (author?.netsuite_vendor_id !== undefined && author.netsuite_vendor_id !== null) {
    container.appendChild(buildVendorNotice(author.netsuite_vendor_id));
  }

  // -- Spelregels
  container.appendChild(buildRulesBlock());

  // -- Indien-formulier
  const formCard = document.createElement('section');
  formCard.className = 'expenses-form-card';
  container.appendChild(formCard);

  const formHeading = document.createElement('h3');
  formHeading.textContent = t('expenses.upload_heading');
  formCard.appendChild(formHeading);

  const statusBox = document.createElement('div');
  statusBox.className = 'admin-status';
  statusBox.hidden = true;
  formCard.appendChild(statusBox);

  formCard.appendChild(
    buildForm(statusBox, () => {
      void loadHistory(historyContainer);
    })
  );

  // -- Geschiedenis
  const historyHeading = document.createElement('h3');
  historyHeading.className = 'expenses-history-heading';
  historyHeading.textContent = t('expenses.history_title');
  container.appendChild(historyHeading);

  const historyContainer = document.createElement('div');
  historyContainer.className = 'expenses-history';
  historyContainer.textContent = '…';
  container.appendChild(historyContainer);

  void loadHistory(historyContainer);
}

// =============================================================================
// Stap 1 — Formulier-keuze + uitleg-dropdown
// =============================================================================
function buildFormSelector(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'expenses-form-selector';

  const heading = document.createElement('h3');
  heading.textContent = t('expenses.download_heading');
  wrap.appendChild(heading);

  // Collapsible uitleg-dropdown
  wrap.appendChild(buildTypeExplanationDetails());

  // Twee download-kaarten
  const grid = document.createElement('div');
  grid.className = 'expenses-form-grid';

  for (const form of FORMS) {
    const cardOpts: {
      title: string;
      desc: string;
      filename: string;
      requiredHint?: string;
    } = {
      title: t(form.titleKey),
      desc: t(form.descKey),
      filename: form.filename,
    };
    if (form.requiredHintKey !== undefined) {
      cardOpts.requiredHint = t(form.requiredHintKey);
    }
    grid.appendChild(buildFormCard(cardOpts));
  }

  wrap.appendChild(grid);
  return wrap;
}

function buildTypeExplanationDetails(): HTMLElement {
  const details = document.createElement('details');
  details.className = 'expenses-types-help';

  const summary = document.createElement('summary');
  summary.className = 'expenses-types-help-summary';
  summary.textContent = t('expenses.types_help_summary');
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'expenses-types-help-body';

  for (const form of FORMS) {
    const h4 = document.createElement('h4');
    h4.className = 'expenses-types-help-title';
    h4.textContent = t(form.titleKey);
    body.appendChild(h4);

    const p = document.createElement('p');
    p.className = 'expenses-types-help-text';
    p.textContent = t(form.explanationKey);
    body.appendChild(p);
  }

  details.appendChild(body);
  return details;
}

function buildFormCard(args: {
  title: string;
  desc: string;
  requiredHint?: string;
  filename: string;
}): HTMLElement {
  // <a download> triggert een echte download in plaats van pagina-navigatie
  const card = document.createElement('a');
  card.className = 'expenses-form-card-option';
  card.href = `/forms/${args.filename}`;
  card.setAttribute('download', args.filename);
  card.setAttribute('rel', 'noopener');

  const titleEl = document.createElement('div');
  titleEl.className = 'expenses-form-card-title';
  titleEl.textContent = args.title;
  card.appendChild(titleEl);

  const descEl = document.createElement('div');
  descEl.className = 'expenses-form-card-desc';
  descEl.textContent = args.desc;
  card.appendChild(descEl);

  if (args.requiredHint !== undefined) {
    const hint = document.createElement('div');
    hint.className = 'expenses-form-card-required';
    hint.textContent = args.requiredHint;
    card.appendChild(hint);
  }

  const arrow = document.createElement('span');
  arrow.className = 'expenses-form-card-arrow';
  arrow.textContent = '↓';
  card.appendChild(arrow);

  return card;
}

function buildVendorNotice(vendorId: string): HTMLElement {
  const notice = document.createElement('div');
  notice.className = 'expenses-vendor-notice';

  const label = document.createElement('span');
  label.className = 'expenses-vendor-label';
  label.textContent = t('expenses.vendor_id_label');
  notice.appendChild(label);

  const value = document.createElement('span');
  value.className = 'expenses-vendor-value';
  value.textContent = vendorId;
  notice.appendChild(value);

  return notice;
}

function buildRulesBlock(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'expenses-rules';

  const heading = document.createElement('h3');
  heading.textContent = t('expenses.rules_heading');
  wrap.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'expenses-rules-list';

  for (const rule of RULES) {
    const item = document.createElement('li');
    item.className = 'expenses-rule';

    const titleEl = document.createElement('strong');
    titleEl.textContent = `${t(rule.titleKey)}: `;
    item.appendChild(titleEl);

    const textEl = document.createElement('span');
    textEl.textContent = t(rule.textKey);
    item.appendChild(textEl);

    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

// =============================================================================
// Stap 2 — Upload-formulier met type-selector
// =============================================================================
function buildForm(statusBox: HTMLElement, onSuccess: () => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'expenses-form';

  // Beschrijving
  const desc = labeledInput('description', t('expenses.field_description'), 'text', true);
  form.appendChild(desc.field);

  // Type-selector
  const typeWrap = document.createElement('label');
  typeWrap.className = 'auth-field';
  const typeLabel = document.createElement('span');
  typeLabel.textContent = t('expenses.field_type');
  typeWrap.appendChild(typeLabel);
  const typeSelect = document.createElement('select');
  typeSelect.name = 'expense_type';
  typeSelect.required = true;
  for (const form_ of FORMS) {
    const opt = document.createElement('option');
    opt.value = form_.type;
    opt.textContent = t(form_.titleKey);
    typeSelect.appendChild(opt);
  }
  typeWrap.appendChild(typeSelect);
  form.appendChild(typeWrap);

  // File-input met drag-and-drop
  const fileWrap = document.createElement('div');
  fileWrap.className = 'auth-field';
  const fileLabel = document.createElement('span');
  fileLabel.textContent = t('expenses.field_receipt');
  fileWrap.appendChild(fileLabel);

  const dropzone = document.createElement('label');
  dropzone.className = 'expense-dropzone';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'receipt';
  fileInput.accept = 'application/pdf';
  fileInput.required = true;
  fileInput.style.display = 'none';
  dropzone.appendChild(fileInput);

  const dropzoneInner = document.createElement('div');
  dropzoneInner.className = 'expense-dropzone-inner';

  const dropText = document.createElement('div');
  dropText.className = 'expense-dropzone-text';
  dropText.textContent = t('expenses.dropzone_text');
  dropzoneInner.appendChild(dropText);

  const dropHint = document.createElement('div');
  dropHint.className = 'expense-dropzone-hint';
  dropHint.textContent = t('expenses.dropzone_hint');
  dropzoneInner.appendChild(dropHint);

  dropzone.appendChild(dropzoneInner);
  fileWrap.appendChild(dropzone);

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file !== undefined) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      updateDropText(dropText, file.name);
    }
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file !== undefined) {
      updateDropText(dropText, file.name);
    }
  });

  form.appendChild(fileWrap);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = t('expenses.submit');
  form.appendChild(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (file === undefined) {
      showStatus(statusBox, 'error', t('expenses.error_no_file'));
      return;
    }
    if (file.type !== 'application/pdf') {
      showStatus(statusBox, 'error', t('expenses.error_not_pdf'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showStatus(statusBox, 'error', t('expenses.error_too_large'));
      return;
    }
    void submitExpense(
      {
        description: desc.input.value.trim(),
        amount: 0,
        expense_type: typeSelect.value as ExpenseType,
        file,
      },
      submit,
      statusBox,
      form,
      dropText,
      onSuccess
    );
  });

  return form;
}

function updateDropText(el: HTMLElement, filename: string): void {
  el.textContent = `📎 ${filename}`;
}

interface SubmitInput {
  description: string;
  amount: number;
  expense_type: ExpenseType;
  file: File;
}

async function submitExpense(
  input: SubmitInput,
  submitBtn: HTMLButtonElement,
  statusBox: HTMLElement,
  form: HTMLFormElement,
  dropText: HTMLElement,
  onSuccess: () => void
): Promise<void> {
  submitBtn.disabled = true;
  showStatus(statusBox, 'success', t('expenses.uploading'));

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userId === undefined) {
    showStatus(statusBox, 'error', t('expenses.error_no_session'));
    submitBtn.disabled = false;
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${userId}/${stamp}-${sanitize(input.file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('expense-receipts')
    .upload(path, input.file, { contentType: 'application/pdf', upsert: false });

  if (uploadError !== null) {
    reportError('expenses.upload', uploadError);
    showStatus(statusBox, 'error', `${t('expenses.error_upload_failed')}: ${uploadError.message}`);
    submitBtn.disabled = false;
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('expenses')
    .insert({
      author_id: userId,
      description: input.description,
      amount: input.amount,
      expense_type: input.expense_type,
      receipt_path: path,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError !== null) {
    reportError('expenses.insert', insertError);
    // Compensatie: storage-bestand opruimen zodat geen wees achterblijft
    await supabase.storage
      .from('expense-receipts')
      .remove([path])
      .catch(() => {
        // Best-effort
      });
    showStatus(statusBox, 'error', `${t('expenses.error_insert_failed')}: ${insertError.message}`);
    submitBtn.disabled = false;
    return;
  }

  // -- Mail-notificatie naar rights@noordhoff.nl
  showStatus(statusBox, 'success', t('expenses.sending_mail'));
  const mailResult = await supabase.functions.invoke<{ ok: boolean }>('notify-new-expense', {
    body: { expense_id: inserted.id },
  });
  const mailErr = await extractFnError(mailResult.error);

  submitBtn.disabled = false;

  if (mailErr !== null) {
    reportError('expenses.notify', new Error(mailErr.message));
    // Declaratie staat in DB; mail mislukt → admin kan via admin-view nog
    // reageren. Toon waarschuwing maar niet als hard fail.
    showStatus(
      statusBox,
      'success',
      `${t('expenses.success_no_mail')} (${formatFnErrorMessage(mailErr)})`
    );
  } else {
    showStatus(statusBox, 'success', t('expenses.success'));
  }

  form.reset();
  dropText.textContent = t('expenses.dropzone_text');
  onSuccess();
}

// =============================================================================
// Historie ("Ingediende declaraties")
// =============================================================================
async function loadHistory(container: HTMLElement): Promise<void> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('submitted_at', { ascending: false });

  container.replaceChildren();

  if (error !== null) {
    reportError('expenses.history', error);
    container.textContent = `Fout: ${error.message}`;
    return;
  }

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('expenses.history_empty');
    container.appendChild(empty);
    return;
  }

  data.forEach((expense) => {
    container.appendChild(renderHistoryRow(expense));
  });
}

function renderHistoryRow(expense: ExpenseRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'expense-row';

  const main = document.createElement('div');
  main.className = 'expense-main';

  const desc = document.createElement('div');
  desc.className = 'expense-desc';
  desc.textContent = expense.description;
  main.appendChild(desc);

  const meta = document.createElement('div');
  meta.className = 'expense-meta';
  const typeLabel =
    expense.expense_type === 'idc'
      ? t('expenses.form_idc_title')
      : t('expenses.form_onkosten_title');
  const parts: string[] = [typeLabel, formatDate(expense.submitted_at)];
  if (expense.amount !== 0) {
    parts.unshift(formatCurrency(expense.amount));
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  row.appendChild(main);

  // Download-link voor de eigen PDF
  if (expense.receipt_path !== null) {
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'expense-download';
    downloadBtn.textContent = t('expenses.history_download');
    downloadBtn.addEventListener('click', () => {
      void openReceipt(expense.receipt_path);
    });
    row.appendChild(downloadBtn);
  }

  const status = document.createElement('span');
  status.className = `expense-status expense-status-${expense.status}`;
  status.textContent = t(STATUS_LABEL[expense.status]);
  row.appendChild(status);

  return row;
}

async function openReceipt(path: string | null): Promise<void> {
  if (path === null) {
    return;
  }
  const { data, error } = await supabase.storage.from('expense-receipts').createSignedUrl(path, 60);
  if (error !== null) {
    reportError('expenses.signedUrl', error);
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}

function labeledInput(
  name: string,
  label: string,
  type: 'text' | 'number',
  required: boolean
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  if (required) {
    input.required = true;
  }
  field.appendChild(input);

  return { field, input };
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}
