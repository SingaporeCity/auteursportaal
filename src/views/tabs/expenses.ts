/**
 * Declaraties-tab — formulier-keuze + spelregels + drag&drop indien-formulier.
 *
 * Demo design (v3):
 * 1. Stap 1: 2 form-cards (Onkostenformulier / IDC Projectkosten) met download
 * 2. Vendor ID notice (teal banner) met expliciete vermelding van Charlotte's ID
 * 3. Spelregels-block met 4 bullets (originele bonnen, alleen PDF, KM-tarief, BTW)
 * 4. Indien-formulier met drag & drop dropzone (alleen PDF, max 10 MB)
 * 5. Geschiedenis-lijst met status-badges per declaratie
 *
 * @module views/tabs/expenses
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
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

const RULES = [
  {
    title: 'Originele bonnen of facturen',
    text: 'altijd meesturen bij de declaratie.',
  },
  {
    title: 'Alleen digitaal in PDF',
    text: 'declaraties kunnen alleen als PDF via dit portaal worden ingediend. Fysieke declaraties of MS Word/Excel-bestanden worden niet in behandeling genomen.',
  },
  {
    title: 'Kilometervergoedingen',
    text: 'opgeven volgens de ANWB Routeplanner tegen 21 cent per kilometer.',
  },
  {
    title: 'Omzetbelasting (BTW)',
    text: 'gebruik dit formulier alleen als u niet bent aangemerkt als ondernemer voor de BTW. Bent u dat wel? Stuur dan uw eigen factuur met daarop minimaal de "brand" en "cost center".',
  },
];

export function renderExpensesTab(container: HTMLElement, author?: AuthorRow): void {
  const heading = document.createElement('h2');
  heading.textContent = t('expenses.new_title');
  container.appendChild(heading);

  // -- Stap 1: download het juiste formulier
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
  formHeading.textContent = '2. Upload het ingevulde formulier als PDF';
  formCard.appendChild(formHeading);

  const statusBox = document.createElement('div');
  statusBox.className = 'admin-status';
  statusBox.hidden = true;
  formCard.appendChild(statusBox);

  formCard.appendChild(buildForm(statusBox, () => void loadHistory(historyContainer)));

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

function buildFormSelector(): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'expenses-form-selector';

  const heading = document.createElement('h3');
  heading.textContent = '1. Download het juiste formulier';
  wrap.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'expenses-form-grid';

  // Onkosten
  grid.appendChild(
    buildFormCard({
      title: 'Onkostenformulier',
      desc: 'Reiskosten · bureaukosten · incidenteel',
      mailSubject: 'Verzoek Onkostenformulier (Auteursportaal)',
    })
  );

  // IDC
  grid.appendChild(
    buildFormCard({
      title: 'Projectkosten (IDC)',
      desc: 'Redactiewerk · projectmatig',
      requiredHint: 'PO-nummer altijd vermelden',
      mailSubject: 'Verzoek IDC-formulier (Auteursportaal)',
    })
  );

  wrap.appendChild(grid);
  return wrap;
}

function buildFormCard(args: {
  title: string;
  desc: string;
  requiredHint?: string;
  mailSubject: string;
}): HTMLElement {
  const card = document.createElement('a');
  card.className = 'expenses-form-card-option';
  card.href = `mailto:crediteuren@noordhoff.nl?subject=${encodeURIComponent(args.mailSubject)}`;

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
  label.textContent = 'Vermeld uw Vendor ID op het formulier:';
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
  heading.textContent = 'Voor u declareert: lees de spelregels';
  wrap.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'expenses-rules-list';

  for (const rule of RULES) {
    const item = document.createElement('li');
    item.className = 'expenses-rule';

    const titleEl = document.createElement('strong');
    titleEl.textContent = `${rule.title}: `;
    item.appendChild(titleEl);

    const textEl = document.createElement('span');
    textEl.textContent = rule.text;
    item.appendChild(textEl);

    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

function buildForm(statusBox: HTMLElement, onSuccess: () => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'expenses-form';

  const desc = labeledInput('description', t('expenses.field_description'), 'text', true);
  const amount = labeledInput('amount', t('expenses.field_amount'), 'number', true);
  amount.input.step = '0.01';
  amount.input.min = '0.01';

  const typeWrap = document.createElement('label');
  typeWrap.className = 'auth-field';
  const typeSpan = document.createElement('span');
  typeSpan.textContent = t('expenses.field_type');
  typeWrap.appendChild(typeSpan);
  const typeSelect = document.createElement('select');
  typeSelect.name = 'expense_type';
  for (const value of ['onkosten', 'idc'] satisfies ExpenseType[]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value === 'onkosten' ? 'Onkosten (reis/bureau)' : 'IDC (projectkosten)';
    typeSelect.appendChild(opt);
  }
  typeWrap.appendChild(typeSelect);

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

  const dropIcon = document.createElement('span');
  dropIcon.className = 'expense-dropzone-icon';
  dropIcon.textContent = '⬆';
  dropIcon.setAttribute('aria-hidden', 'true');
  dropzoneInner.appendChild(dropIcon);

  const dropText = document.createElement('div');
  dropText.className = 'expense-dropzone-text';
  dropText.textContent = 'Sleep een PDF hierheen of klik om te selecteren';
  dropzoneInner.appendChild(dropText);

  const dropHint = document.createElement('div');
  dropHint.className = 'expense-dropzone-hint';
  dropHint.textContent = 'Alleen PDF, max 10 MB';
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

  form.appendChild(desc.field);
  form.appendChild(amount.field);
  form.appendChild(typeWrap);
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
      showStatus(statusBox, 'error', 'Selecteer een PDF-bon.');
      return;
    }
    if (file.type !== 'application/pdf') {
      showStatus(statusBox, 'error', 'Alleen PDF-bestanden toegestaan.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showStatus(statusBox, 'error', 'Bestand is groter dan 10 MB.');
      return;
    }
    void submitExpense(
      {
        description: desc.input.value.trim(),
        amount: Number(amount.input.value),
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
  showStatus(statusBox, 'success', 'Bezig met uploaden…');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userId === undefined) {
    showStatus(statusBox, 'error', 'Geen sessie. Log opnieuw in.');
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
    showStatus(statusBox, 'error', `Upload faalde: ${uploadError.message}`);
    submitBtn.disabled = false;
    return;
  }

  const { error: insertError } = await supabase.from('expenses').insert({
    author_id: userId,
    description: input.description,
    amount: input.amount,
    expense_type: input.expense_type,
    receipt_path: path,
    status: 'pending',
  });

  submitBtn.disabled = false;

  if (insertError !== null) {
    reportError('expenses.insert', insertError);
    showStatus(statusBox, 'error', `Indienen faalde: ${insertError.message}`);
    return;
  }

  showStatus(statusBox, 'success', 'Declaratie ingediend — admin krijgt deze ter beoordeling.');
  form.reset();
  dropText.textContent = 'Sleep een PDF hierheen of klik om te selecteren';
  onSuccess();
}

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
  meta.textContent = `${formatCurrency(expense.amount)} · ${formatDate(expense.submitted_at)}`;
  main.appendChild(meta);

  row.appendChild(main);

  const status = document.createElement('span');
  status.className = `expense-status expense-status-${expense.status}`;
  status.textContent = t(STATUS_LABEL[expense.status]);
  row.appendChild(status);

  return row;
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
