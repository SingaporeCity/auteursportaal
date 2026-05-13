/**
 * Admin-modal: upload één contract voor een specifieke auteur.
 *
 * Flow:
 *   1. Admin klikt op "Contract uploaden" in een auteur-card.
 *   2. Modal opent met contractnummer + PDF (verplicht) en optionele
 *      metadata (contract-naam, royaltypercentage, ingangsdatum, einddatum).
 *   3. Submit → genereer UUID → upload PDF naar `contracts/{author_id}/
 *      {contract_id}.pdf` → INSERT contracts-rij.
 *   4. Bij INSERT-fout: storage-PDF opruimen zodat geen wees achterblijft.
 *
 * @module views/admin/contract-upload
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { AuthorRow } from '@/auth';
import type { Database } from '@/types/db';

type ContractInsert = Database['public']['Tables']['contracts']['Insert'];

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const CONTRACTS_BUCKET = 'contracts';

export function openContractUploadModal(author: AuthorRow, onDone: () => void): void {
  if (document.querySelector('.modal-overlay.contract-upload-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay contract-upload-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-import-modal contract-upload-modal';
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
  heading.textContent = t('admin.contract_upload_heading').replace(
    '{name}',
    `${author.first_name} ${author.last_name}`
  );
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.contract_upload_intro');
  modal.appendChild(intro);

  // -- Velden
  const numberField = labeledInput(t('admin.contract_upload_field_number'), 'text', true);
  modal.appendChild(numberField.field);

  const nameField = labeledInput(t('admin.contract_upload_field_name'), 'text', false);
  modal.appendChild(nameField.field);

  const royaltyField = labeledInput(t('admin.contract_upload_field_royalty'), 'number', false);
  royaltyField.input.step = '0.01';
  royaltyField.input.min = '0';
  royaltyField.input.max = '100';
  modal.appendChild(royaltyField.field);

  const startField = labeledInput(t('admin.contract_upload_field_start'), 'date', false);
  modal.appendChild(startField.field);

  const endField = labeledInput(t('admin.contract_upload_field_end'), 'date', false);
  modal.appendChild(endField.field);

  // -- File-input
  const fileWrap = document.createElement('label');
  fileWrap.className = 'auth-field';
  const fileSpan = document.createElement('span');
  fileSpan.textContent = t('admin.contract_upload_field_pdf');
  fileWrap.appendChild(fileSpan);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/pdf,.pdf';
  fileInput.required = true;
  fileWrap.appendChild(fileInput);
  modal.appendChild(fileWrap);

  // -- Status + submit
  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  modal.appendChild(status);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'auth-submit';
  submit.textContent = t('admin.contract_upload_submit');
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
    void handleSubmit(
      author,
      {
        contract_number: numberField.input.value.trim(),
        contract_name: nameField.input.value.trim(),
        royalty_percentage: royaltyField.input.value.trim(),
        start_date: startField.input.value.trim(),
        end_date: endField.input.value.trim(),
        file: fileInput.files?.[0],
      },
      submit,
      status,
      close
    );
  });

  document.body.appendChild(overlay);
}

interface FormValues {
  contract_number: string;
  contract_name: string;
  royalty_percentage: string;
  start_date: string;
  end_date: string;
  file: File | undefined;
}

async function handleSubmit(
  author: AuthorRow,
  values: FormValues,
  submit: HTMLButtonElement,
  status: HTMLElement,
  close: () => void
): Promise<void> {
  status.hidden = true;

  if (values.contract_number === '') {
    showStatus(status, 'error', t('admin.contract_upload_error_no_number'));
    return;
  }
  if (values.file === undefined) {
    showStatus(status, 'error', t('admin.contract_upload_error_no_pdf'));
    return;
  }
  if (values.file.type !== 'application/pdf') {
    showStatus(status, 'error', t('admin.contract_upload_error_not_pdf'));
    return;
  }
  if (values.file.size > MAX_FILE_BYTES) {
    showStatus(status, 'error', t('admin.contract_upload_error_too_large'));
    return;
  }

  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  showStatus(status, 'success', t('common.busy'));

  const contractId = crypto.randomUUID();
  const path = `${author.id}/${contractId}.pdf`;

  // 1. Upload PDF eerst (`upsert:false` voorkomt overschrijven bij UUID-collision)
  const { error: uploadErr } = await supabase.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, values.file, { contentType: 'application/pdf', upsert: false });
  if (uploadErr !== null) {
    reportError('admin.contract_upload', uploadErr);
    showStatus(
      status,
      'error',
      `${t('admin.contract_upload_error_upload_failed')}: ${uploadErr.message}`
    );
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    return;
  }

  // 2. INSERT contracts-rij met dezelfde UUID + optionele metadata
  const insertRow: ContractInsert = {
    id: contractId,
    author_id: author.id,
    contract_number: values.contract_number,
    file_path: path,
  };
  if (values.contract_name !== '') {
    insertRow.contract_name = values.contract_name;
  }
  if (values.royalty_percentage !== '') {
    const pct = Number(values.royalty_percentage);
    if (Number.isFinite(pct)) {
      insertRow.royalty_percentage = pct;
    }
  }
  if (values.start_date !== '') {
    insertRow.start_date = values.start_date;
  }
  if (values.end_date !== '') {
    insertRow.end_date = values.end_date;
  }

  const { error: insertErr } = await supabase.from('contracts').insert(insertRow);

  if (insertErr !== null) {
    reportError('admin.contract_insert', insertErr);
    // Compensatie: PDF opruimen zodat geen wees-bestand achterblijft
    await supabase.storage
      .from(CONTRACTS_BUCKET)
      .remove([path])
      .catch(() => {
        // best-effort
      });
    showStatus(
      status,
      'error',
      `${t('admin.contract_upload_error_insert_failed')}: ${insertErr.message}`
    );
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    return;
  }

  // Success — sluit modal
  showStatus(
    status,
    'success',
    t('admin.contract_upload_success').replace('{name}', `${author.first_name} ${author.last_name}`)
  );
  // Korte vertraging zodat de gebruiker de succesmelding ziet
  setTimeout(close, 800);
}

function labeledInput(
  label: string,
  type: 'text' | 'number' | 'date',
  required: boolean
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = type;
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
