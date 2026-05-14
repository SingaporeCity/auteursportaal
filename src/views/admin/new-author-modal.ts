/**
 * Admin-modal: maak één nieuwe auteur aan met alleen email + voornaam +
 * achternaam. Vervangt de oude inline-form (die onder de fold belandde
 * en daardoor "doet niks" leek).
 *
 * Flow:
 *   1. Admin klikt "Importeer nieuwe auteur" in de Auteurs toevoegen-card.
 *   2. Modal opent, drie velden verplicht.
 *   3. Submit → INSERT in `authors` (status default `pending_data`,
 *      `must_change_password=true`) → invoke `create-accounts`
 *      mode='invite' met start-wachtwoord 'Noordhoff'.
 *   4. Welkomstmail wordt verstuurd vanuit de Edge Function (in test-fase
 *      stil door `DISABLE_AUTH_EMAILS=true`).
 *
 * @module views/admin/new-author-modal
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import { extractFnError, formatFnErrorMessage } from '@/lib/edge-function-errors';

const INITIAL_PASSWORD = 'Noordhoff';

interface CreateAccountsResult {
  results?: {
    author_id?: string;
    email?: string;
    status: 'invited' | 'activated' | 'reminder_sent' | 'already_active' | 'failed';
    error?: string;
  }[];
}

interface FormValues {
  email: string;
  first_name: string;
  last_name: string;
}

export function openNewAuthorModal(onDone: () => void): void {
  if (document.querySelector('.modal-overlay.new-author-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay new-author-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal csv-import-modal new-author-modal';
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
  heading.textContent = t('admin.new_author_heading');
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.new_author_intro');
  modal.appendChild(intro);

  const emailField = labeledInput(t('admin.new_author_field_email'), 'email');
  modal.appendChild(emailField.field);

  const firstNameField = labeledInput(t('admin.new_author_field_firstname'), 'text');
  modal.appendChild(firstNameField.field);

  const lastNameField = labeledInput(t('admin.new_author_field_lastname'), 'text');
  modal.appendChild(lastNameField.field);

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  modal.appendChild(status);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'auth-submit';
  submit.textContent = t('admin.new_author_submit');
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
      {
        email: emailField.input.value.trim(),
        first_name: firstNameField.input.value.trim(),
        last_name: lastNameField.input.value.trim(),
      },
      submit,
      status,
      close
    );
  });

  document.body.appendChild(overlay);
  emailField.input.focus();
}

async function handleSubmit(
  values: FormValues,
  submit: HTMLButtonElement,
  status: HTMLElement,
  close: () => void
): Promise<void> {
  status.hidden = true;

  if (values.email === '' || values.first_name === '' || values.last_name === '') {
    showStatus(status, 'error', t('admin.new_author_error_required'));
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    showStatus(status, 'error', t('admin.new_author_error_email'));
    return;
  }

  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  showStatus(status, 'success', t('common.busy'));

  // 1. INSERT auteur-rij (status default pending_data; trigger zet
  //    created_at, etc.). `must_change_password=false` hier — de prompt
  //    voor wachtwoord-wijziging komt pas bij eerste login op een
  //    geactiveerd account. De activeer-flow zet die vlag dan op true.
  const { data, error } = await supabase
    .from('authors')
    .insert({
      email: values.email.toLowerCase(),
      first_name: values.first_name,
      last_name: values.last_name,
      is_admin: false,
      must_change_password: false,
    })
    .select('id, email')
    .single();

  if (error !== null) {
    reportError('admin.new_author.insert', error);
    showStatus(status, 'error', `${t('admin.new_author_error_insert')}: ${error.message}`);
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    return;
  }

  // 2. Edge Function aanroepen — maakt auth-user + verstuurt welkomstmail
  //    (mail uit in test-fase via DISABLE_AUTH_EMAILS).
  const inviteResult = await supabase.functions.invoke<CreateAccountsResult>('create-accounts', {
    body: {
      author_id: data.id,
      email: data.email,
      password: INITIAL_PASSWORD,
      mode: 'invite',
    },
  });

  const fnErr = await extractFnError(inviteResult.error);
  const firstResult = inviteResult.data?.results?.[0];
  const failed = fnErr !== null || firstResult === undefined || firstResult.status === 'failed';

  if (failed) {
    const reason =
      fnErr !== null ? formatFnErrorMessage(fnErr) : (firstResult?.error ?? 'onbekend');
    reportError('admin.new_author.invite', new Error(reason));
    showStatus(status, 'error', `${t('admin.new_author_error_invite')}: ${reason}`);
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    // Auteur-rij blijft staan — admin kan opnieuw een invite triggeren via
    // "Stuur herinnering" op de auteur-card.
    return;
  }

  showStatus(
    status,
    'success',
    t('admin.new_author_success').replace('{email}', data.email).replace('{pw}', INITIAL_PASSWORD)
  );
  setTimeout(close, 1500);
}

function labeledInput(
  label: string,
  type: 'text' | 'email'
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = type;
  input.required = true;
  field.appendChild(input);

  return { field, input };
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
