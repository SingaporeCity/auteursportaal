/**
 * Admin-modal: koppel een auteur aan NetSuite door Vendor ID en Alliant
 * ID in te vullen. Verschijnt wanneer admin op de primary-actie
 * "IDs koppelen" klikt in het detail-paneel (status `id_koppelen`).
 *
 * Beide velden zijn optioneel binnen de modal — admin kan in stappen
 * invullen. Pas wanneer BEIDE gevuld zijn schuift de auteur door naar
 * de statements-status. Lege strings worden als NULL opgeslagen zodat
 * de status-derivation in admin.ts klopt.
 *
 * @module views/admin/id-koppel-modal
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { AuthorRow } from '@/auth';

export function openIdKoppelModal(author: AuthorRow, onDone: () => void): void {
  if (document.querySelector('.modal-overlay.id-koppel-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay id-koppel-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-import-modal id-koppel-modal';
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
  heading.textContent = t('admin.id_koppel_heading').replace(
    '{name}',
    `${author.first_name} ${author.last_name}`.trim()
  );
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.id_koppel_intro');
  modal.appendChild(intro);

  const vendorField = labeledInput(
    t('admin.id_koppel_field_vendor'),
    author.netsuite_vendor_id ?? ''
  );
  modal.appendChild(vendorField.field);

  const alliantField = labeledInput(t('admin.id_koppel_field_alliant'), author.alliant_id ?? '');
  modal.appendChild(alliantField.field);

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  modal.appendChild(status);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'auth-submit';
  submit.textContent = t('admin.id_koppel_submit');
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
      vendorField.input.value.trim(),
      alliantField.input.value.trim(),
      submit,
      status,
      close
    );
  });

  document.body.appendChild(overlay);
  setTimeout(() => {
    vendorField.input.focus();
  }, 50);
}

async function handleSubmit(
  author: AuthorRow,
  vendorRaw: string,
  alliantRaw: string,
  submit: HTMLButtonElement,
  status: HTMLElement,
  close: () => void
): Promise<void> {
  status.hidden = true;
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  showStatus(status, 'success', t('common.busy'));

  const { error } = await supabase
    .from('authors')
    .update({
      netsuite_vendor_id: vendorRaw === '' ? null : vendorRaw,
      alliant_id: alliantRaw === '' ? null : alliantRaw,
    })
    .eq('id', author.id);

  if (error !== null) {
    reportError('admin.id_koppel.update', error);
    showStatus(status, 'error', `${t('admin.id_koppel_error')}: ${error.message}`);
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    return;
  }

  showStatus(
    status,
    'success',
    t('admin.id_koppel_success').replace(
      '{name}',
      `${author.first_name} ${author.last_name}`.trim()
    )
  );
  // Vervang submit-knop door close-knop zodat admin de bevestiging rustig
  // kan lezen en zelf wegklikt; geen auto-close timer.
  submit.disabled = false;
  submit.removeAttribute('aria-busy');
  submit.textContent = t('common.close');
  const fresh = submit.cloneNode(true) as HTMLButtonElement;
  submit.parentNode?.replaceChild(fresh, submit);
  fresh.addEventListener('click', close);
}

function labeledInput(
  label: string,
  initial: string
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
  input.value = initial;
  field.appendChild(input);

  return { field, input };
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
