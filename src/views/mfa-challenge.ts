/**
 * Post-login TOTP-challenge.
 *
 * Wordt getoond wanneer:
 *   - `getAuthenticatorAssuranceLevel()` returnt currentLevel='aal1' + nextLevel='aal2'
 *   - en er minstens één verified TOTP-factor bestaat.
 *
 * Gebruiker krijgt 6-cijferig veld. Bij succesvolle verify wordt de sessie
 * opgewaardeerd naar aal2; main.ts rendert opnieuw en de gebruiker komt op
 * de portaal-pagina.
 *
 * @module views/mfa-challenge
 */

import { supabase } from '@/lib/supabase';
import { signOut } from '@/auth';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';

export function renderMfaChallengeView(root: HTMLElement, factorId: string): void {
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
  heading.textContent = t('auth.mfa_challenge.title');
  card.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'auth-subtitle';
  intro.textContent = t('auth.mfa_challenge.intro');
  card.appendChild(intro);

  const form = document.createElement('form');
  form.noValidate = true;

  const codeField = otpInput('challenge_code', t('auth.mfa_challenge.code_label'));
  form.appendChild(codeField.field);

  const errorBox = document.createElement('div');
  errorBox.className = 'auth-error';
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = t('auth.mfa_challenge.submit');
  form.appendChild(submit);

  card.appendChild(form);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'auth-link';
  logoutBtn.textContent = t('auth.logout');
  logoutBtn.addEventListener('click', () => {
    void signOut();
  });
  card.appendChild(logoutBtn);

  // Focus direct op het code-veld zodat scannen + plakken meteen kan
  setTimeout(() => {
    codeField.input.focus();
  }, 0);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeField.input.value.replace(/\s/g, '');
    void handleVerify(factorId, code, { submit, errorBox });
  });
}

async function handleVerify(
  factorId: string,
  code: string,
  ui: { submit: HTMLButtonElement; errorBox: HTMLElement }
): Promise<void> {
  ui.errorBox.hidden = true;

  if (!/^\d{6}$/.test(code)) {
    showError(ui.errorBox, t('auth.mfa_challenge.error_code_format'));
    return;
  }

  setBusy(ui.submit, true);

  const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeErr !== null) {
    setBusy(ui.submit, false);
    reportError('mfaChallenge.challenge', challengeErr);
    showError(ui.errorBox, t('auth.mfa_challenge.error_generic'));
    return;
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyErr !== null) {
    setBusy(ui.submit, false);
    reportError('mfaChallenge.verify', verifyErr);
    showError(ui.errorBox, t('auth.mfa_challenge.error_invalid_code'));
    return;
  }

  // Sessie opgewaardeerd naar aal2. Trigger rerender.
  window.dispatchEvent(new Event('auth:rerender'));
}

function otpInput(
  name: string,
  label: string
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
  input.name = name;
  input.required = true;
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.pattern = '[0-9]{6}';
  input.maxLength = 7;
  input.className = 'mfa-code-input';
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
