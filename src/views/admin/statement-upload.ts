/**
 * Admin: statement-upload form per auteur.
 *
 * Upload een PDF naar `statements`-bucket onder de auteur-UUID en maakt
 * een `payments`-record aan dat ernaar verwijst. Padconventie:
 *   {author_uuid}/{type}/{year}/{filename}
 *
 * @module views/admin/statement-upload
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import type { Database, PaymentType } from '@/types/db';

type AuthorRow = Database['public']['Tables']['authors']['Row'];

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB voor royalty-statements

const TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'royalty', label: 'Royalty-afrekening' },
  { value: 'subsidiary', label: 'Nevenrechten' },
  { value: 'foreign', label: 'Foreign Rights' },
  { value: 'jaaropgave', label: 'Jaaropgave' },
];

export function buildStatementUploadForm(author: AuthorRow, onSuccess: () => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'admin-upload-form';

  const heading = document.createElement('h4');
  heading.textContent = 'Nieuw statement uploaden';
  form.appendChild(heading);

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  form.appendChild(status);

  const titleField = textInput('title', 'Titel (NL)', true);
  const yearField = textInput('year', 'Jaar', true);
  yearField.input.type = 'number';
  yearField.input.min = '2020';
  yearField.input.max = String(new Date().getFullYear() + 1);
  yearField.input.value = String(new Date().getFullYear() - 1);
  const amountField = textInput('amount', 'Bedrag (€)', true);
  amountField.input.type = 'number';
  amountField.input.step = '0.01';
  amountField.input.min = '0';
  const dateField = textInput('payment_date', 'Datum afrekening', false);
  dateField.input.type = 'date';

  // Type selector
  const typeWrap = document.createElement('label');
  typeWrap.className = 'auth-field';
  const typeSpan = document.createElement('span');
  typeSpan.textContent = 'Type';
  typeWrap.appendChild(typeSpan);
  const typeSelect = document.createElement('select');
  typeSelect.name = 'type';
  TYPE_OPTIONS.forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    typeSelect.appendChild(o);
  });
  typeWrap.appendChild(typeSelect);

  // File input
  const fileWrap = document.createElement('label');
  fileWrap.className = 'auth-field';
  const fileSpan = document.createElement('span');
  fileSpan.textContent = 'PDF-bestand';
  fileWrap.appendChild(fileSpan);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/pdf';
  fileInput.required = true;
  fileWrap.appendChild(fileInput);

  form.appendChild(titleField.field);
  form.appendChild(yearField.field);
  form.appendChild(amountField.field);
  form.appendChild(dateField.field);
  form.appendChild(typeWrap);
  form.appendChild(fileWrap);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = 'Uploaden';
  form.appendChild(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const file = fileInput.files?.[0];
    if (file === undefined) {
      showStatus(status, 'error', 'Selecteer een PDF.');
      return;
    }
    if (file.type !== 'application/pdf') {
      showStatus(status, 'error', 'Alleen PDF-bestanden toegestaan.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showStatus(status, 'error', `Bestand groter dan ${String(MAX_FILE_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    void doUpload(
      {
        author,
        type: typeSelect.value as PaymentType,
        year: Number(yearField.input.value),
        amount: Number(amountField.input.value),
        title: titleField.input.value.trim(),
        paymentDate: dateField.input.value.trim().length > 0 ? dateField.input.value.trim() : null,
        file,
      },
      submit,
      status,
      form,
      onSuccess
    );
  });

  return form;
}

interface UploadInput {
  author: AuthorRow;
  type: PaymentType;
  year: number;
  amount: number;
  title: string;
  paymentDate: string | null;
  file: File;
}

async function doUpload(
  input: UploadInput,
  submitBtn: HTMLButtonElement,
  statusBox: HTMLElement,
  form: HTMLFormElement,
  onSuccess: () => void
): Promise<void> {
  submitBtn.disabled = true;
  showStatus(statusBox, 'info', 'Bezig met uploaden…');

  const filename = sanitize(input.file.name);
  const path = `${input.author.id}/${input.type}/${String(input.year)}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('statements')
    .upload(path, input.file, { contentType: 'application/pdf', upsert: false });

  if (uploadError !== null) {
    reportError('admin.upload', uploadError);
    showStatus(statusBox, 'error', `Upload faalde: ${uploadError.message}`);
    submitBtn.disabled = false;
    return;
  }

  const { error: insertError } = await supabase.from('payments').insert({
    author_id: input.author.id,
    type: input.type,
    year: input.year,
    amount: input.amount,
    title_nl: input.title,
    payment_date: input.paymentDate,
    file_path: path,
  });

  submitBtn.disabled = false;

  if (insertError !== null) {
    reportError('admin.payment.insert', insertError);
    showStatus(statusBox, 'error', `Payment record faalde: ${insertError.message}`);
    return;
  }

  showStatus(statusBox, 'success', `Statement geüpload voor ${input.author.first_name}.`);
  form.reset();
  yearReset(form);
  onSuccess();
}

function yearReset(form: HTMLFormElement): void {
  // Reset zet alle velden naar de DOM-default; we willen jaar weer op vorig jaar
  const yearInput = form.querySelector('input[name="year"]');
  if (yearInput instanceof HTMLInputElement) {
    yearInput.value = String(new Date().getFullYear() - 1);
  }
}

function textInput(
  name: string,
  label: string,
  required: boolean
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
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
