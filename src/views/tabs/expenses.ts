/**
 * Declaraties-tab: indienformulier + lijst eigen declaraties.
 *
 * Indienen:
 *   1. PDF-bon uploaden naar `expense-receipts` bucket onder eigen UUID-pad
 *   2. INSERT in `expenses`-tabel met `status = 'pending'`
 *   3. Admin keurt later goed/af in admin-UI
 *
 * @module views/tabs/expenses
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database, ExpenseStatus, ExpenseType } from '@/types/db';

type ExpenseRow = Database['public']['Tables']['expenses']['Row'];

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const STATUS_LABEL: Record<ExpenseStatus, Parameters<typeof t>[0]> = {
  pending: 'expenses.status_pending',
  approved: 'expenses.status_approved',
  rejected: 'expenses.status_rejected',
  paid: 'expenses.status_paid',
};

export function renderExpensesTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('expenses.title');
  container.appendChild(heading);

  const formCard = document.createElement('section');
  formCard.className = 'expenses-form-card';
  container.appendChild(formCard);

  const formHeading = document.createElement('h3');
  formHeading.textContent = t('expenses.new_title');
  formCard.appendChild(formHeading);

  const statusBox = document.createElement('div');
  statusBox.className = 'admin-status';
  statusBox.hidden = true;
  formCard.appendChild(statusBox);

  formCard.appendChild(buildForm(statusBox, () => void loadHistory(historyContainer)));

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

  const fileWrap = document.createElement('label');
  fileWrap.className = 'auth-field';
  const fileSpan = document.createElement('span');
  fileSpan.textContent = t('expenses.field_receipt');
  fileWrap.appendChild(fileSpan);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'receipt';
  fileInput.accept = 'application/pdf';
  fileInput.required = true;
  fileWrap.appendChild(fileInput);

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
      onSuccess
    );
  });

  return form;
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
  onSuccess: () => void
): Promise<void> {
  submitBtn.disabled = true;
  showStatus(statusBox, 'info', 'Bezig met uploaden…');

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (userId === undefined) {
    showStatus(statusBox, 'error', 'Geen sessie. Log opnieuw in.');
    submitBtn.disabled = false;
    return;
  }

  // -- 1. Upload PDF
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

  // -- 2. INSERT expense
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

function showStatus(box: HTMLElement, kind: 'error' | 'success' | 'info', message: string): void {
  box.className = `admin-status admin-status-${kind === 'info' ? 'success' : kind}`;
  box.textContent = message;
  box.hidden = false;
}

function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}
