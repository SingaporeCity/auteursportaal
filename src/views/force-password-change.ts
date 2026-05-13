/**
 * Geforceerd wachtwoord-wijzig-scherm bij eerste inlog.
 *
 * Wordt getoond zolang `authors.must_change_password = true`. Geen sluitknop,
 * geen Escape — gebruiker kan alleen wegkomen door een nieuw wachtwoord te
 * kiezen of door uit te loggen.
 *
 * Na succesvolle wijziging:
 *   1. supabase.auth.updateUser({ password: new }) → nieuwe hash
 *   2. UPDATE authors SET must_change_password=false, password_changed_at=NOW()
 *   3. Triggert USER_UPDATED → main.ts rendert opnieuw → volgende stap (MFA-enroll).
 *
 * @module views/force-password-change
 */

import { supabase } from '@/lib/supabase';
import { signOut, PASSWORD_MIN_LENGTH } from '@/auth';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';

export function renderForcePasswordChangeView(root: HTMLElement, authorId: string): void {
  root.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'auth-wrapper';

  const formPanel = document.createElement('section');
  formPanel.className = 'auth-form-panel';
  wrapper.appendChild(formPanel);
  root.appendChild(wrapper);

  const card = document.createElement('div');
  card.className = 'auth-card';
  formPanel.appendChild(card);

  const heading = document.createElement('h2');
  heading.textContent = t('auth.force_password.title');
  card.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'auth-subtitle';
  intro.textContent = t('auth.force_password.intro');
  card.appendChild(intro);

  const form = document.createElement('form');
  form.noValidate = true;

  const pw1 = passwordField('new_password', t('auth.force_password.field_new'), 'new-password');
  const pw2 = passwordField(
    'confirm_password',
    t('auth.force_password.field_confirm'),
    'new-password'
  );
  form.appendChild(pw1.field);
  form.appendChild(pw2.field);

  const hint = document.createElement('p');
  hint.className = 'auth-hint';
  hint.textContent = t('auth.force_password.hint').replace('{min}', String(PASSWORD_MIN_LENGTH));
  form.appendChild(hint);

  const errorBox = document.createElement('div');
  errorBox.className = 'auth-error';
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = t('auth.force_password.submit');
  form.appendChild(submit);

  card.appendChild(form);

  // Uitlog-link als noodluik. Geen "annuleer" want dat zou de force-flow
  // omzeilen; uitloggen brengt terug naar het login-scherm.
  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'auth-link';
  logoutBtn.textContent = t('auth.logout');
  logoutBtn.addEventListener('click', () => {
    void signOut();
  });
  card.appendChild(logoutBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleSubmit(authorId, pw1.input.value, pw2.input.value, { submit, errorBox });
  });
}

async function handleSubmit(
  authorId: string,
  newPw: string,
  confirmPw: string,
  ui: { submit: HTMLButtonElement; errorBox: HTMLElement }
): Promise<void> {
  ui.errorBox.hidden = true;

  if (newPw.length < PASSWORD_MIN_LENGTH) {
    showError(
      ui.errorBox,
      t('auth.force_password.error_too_short').replace('{min}', String(PASSWORD_MIN_LENGTH))
    );
    return;
  }
  if (newPw !== confirmPw) {
    showError(ui.errorBox, t('auth.force_password.error_mismatch'));
    return;
  }
  if (newPw === 'Noordhoff') {
    showError(ui.errorBox, t('auth.force_password.error_same_as_initial'));
    return;
  }

  setBusy(ui.submit, true);

  const { error: pwErr } = await supabase.auth.updateUser({ password: newPw });
  if (pwErr !== null) {
    setBusy(ui.submit, false);
    reportError('forcePassword.updateUser', pwErr);
    showError(ui.errorBox, t('auth.force_password.error_generic'));
    return;
  }

  // Markeer dat de wijziging is gebeurd zodat main.ts naar de volgende stap
  // (MFA-enroll) gaat. RLS-policy `authors_update_own` laat dit toe voor de
  // ingelogde gebruiker.
  const { error: flagErr } = await supabase
    .from('authors')
    .update({
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .eq('id', authorId);

  if (flagErr !== null) {
    setBusy(ui.submit, false);
    reportError('forcePassword.flagUpdate', flagErr);
    showError(ui.errorBox, t('auth.force_password.error_flag_failed'));
    return;
  }

  // Force re-render via custom event — USER_UPDATED kan race-conditie hebben
  // omdat main.ts de authors-rij opnieuw ophaalt vóór onze UPDATE doorgekomen
  // is. `auth:rerender` luistert in main.ts en triggert een schone restoreSession.
  window.dispatchEvent(new Event('auth:rerender'));
}

function passwordField(
  name: string,
  label: string,
  autocomplete: 'new-password' | 'current-password'
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = 'password';
  input.name = name;
  input.required = true;
  input.autocomplete = autocomplete;
  input.minLength = PASSWORD_MIN_LENGTH;
  field.appendChild(input);

  return { field, input };
}

function showError(box: HTMLElement, message: string): void {
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
