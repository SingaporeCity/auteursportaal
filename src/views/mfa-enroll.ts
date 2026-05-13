/**
 * Geforceerde TOTP-enrollment bij eerste inlog (na wachtwoord-wijziging).
 *
 * Flow:
 *   1. `supabase.auth.mfa.enroll({ factorType: 'totp' })` → returnt
 *      factor-id + QR-code-SVG (data-URL) + base32-secret + otpauth-URI.
 *   2. Gebruiker scant QR met authenticator-app (Google Authenticator, Authy,
 *      1Password, Microsoft Authenticator, etc.).
 *   3. Voert 6-cijferige code in → challenge + verify.
 *   4. Bij succes: factor staat als verified geregistreerd. Sessie wordt
 *      geüpgrade naar aal2. Custom event triggert main.ts om door te gaan.
 *
 * Eerdere unverified factors (gebruiker refresh in midden van enrollment)
 * worden opgeruimd voordat we een nieuwe aanmaken — anders accumuleert
 * troep.
 *
 * @module views/mfa-enroll
 */

import { supabase } from '@/lib/supabase';
import { signOut, type AuthorRow } from '@/auth';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';

interface EnrolledFactor {
  factorId: string;
  qrCode: string; // SVG data-URL van Supabase
  secret: string; // base32, voor handmatige invoer
}

export function renderMfaEnrollView(root: HTMLElement, author: AuthorRow): void {
  root.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'auth-wrapper';

  const formPanel = document.createElement('section');
  formPanel.className = 'auth-form-panel mfa-enroll-panel';
  wrapper.appendChild(formPanel);
  root.appendChild(wrapper);

  const card = document.createElement('div');
  card.className = 'auth-card mfa-card';
  formPanel.appendChild(card);

  const heading = document.createElement('h2');
  heading.textContent = t('auth.mfa_enroll.title');
  card.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'auth-subtitle';
  intro.textContent = t('auth.mfa_enroll.intro');
  card.appendChild(intro);

  const statusEl = document.createElement('div');
  statusEl.className = 'auth-status';
  statusEl.textContent = t('common.loading');
  card.appendChild(statusEl);

  // Uitlog-link voor noodgeval (geen smartphone bij de hand etc.)
  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'auth-link';
  logoutBtn.textContent = t('auth.logout');
  logoutBtn.addEventListener('click', () => {
    void signOut();
  });

  void startEnrollment(card, statusEl, logoutBtn, author);
}

async function startEnrollment(
  card: HTMLElement,
  statusEl: HTMLElement,
  logoutBtn: HTMLElement,
  author: AuthorRow
): Promise<void> {
  // 1. Ruim eerdere unverified factors op zodat we niet accumuleren bij
  // herhaalde refresh-pogingen.
  await cleanupUnverifiedFactors();

  // 2. Enroll nieuwe TOTP-factor
  const friendlyName = `Auteursportaal — ${author.first_name} ${author.last_name}`.slice(0, 50);
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });

  if (error !== null) {
    reportError('mfa.enroll', error);
    statusEl.textContent = t('auth.mfa_enroll.error_enroll');
    card.appendChild(logoutBtn);
    return;
  }

  // Supabase v2 levert `qr_code` (svg-data-URL) + `secret` (base32) + `uri`
  // (otpauth://). We tonen QR + secret zodat gebruiker beide opties heeft.
  const enrolled: EnrolledFactor = {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };

  renderEnrollForm(card, statusEl, logoutBtn, enrolled);
}

function renderEnrollForm(
  card: HTMLElement,
  statusEl: HTMLElement,
  logoutBtn: HTMLElement,
  enrolled: EnrolledFactor
): void {
  // Verwijder loading-status zodra de QR er is
  statusEl.remove();

  // -- QR-code visualisatie
  const qrWrap = document.createElement('div');
  qrWrap.className = 'mfa-qr-wrap';

  const qrLabel = document.createElement('p');
  qrLabel.className = 'mfa-step-label';
  qrLabel.textContent = t('auth.mfa_enroll.step_scan');
  qrWrap.appendChild(qrLabel);

  const qrImg = document.createElement('img');
  qrImg.className = 'mfa-qr';
  qrImg.src = enrolled.qrCode;
  qrImg.alt = t('auth.mfa_enroll.qr_alt');
  qrImg.width = 200;
  qrImg.height = 200;
  qrWrap.appendChild(qrImg);

  // Handmatige-invoer fallback (oudere apps / accessibility)
  const secretLabel = document.createElement('p');
  secretLabel.className = 'mfa-secret-label';
  secretLabel.textContent = t('auth.mfa_enroll.manual_label');
  qrWrap.appendChild(secretLabel);

  const secretCode = document.createElement('code');
  secretCode.className = 'mfa-secret';
  secretCode.textContent = enrolled.secret;
  qrWrap.appendChild(secretCode);

  card.appendChild(qrWrap);

  // -- Verify-formulier
  const form = document.createElement('form');
  form.noValidate = true;
  form.className = 'mfa-verify-form';

  const stepLabel = document.createElement('p');
  stepLabel.className = 'mfa-step-label';
  stepLabel.textContent = t('auth.mfa_enroll.step_verify');
  form.appendChild(stepLabel);

  const codeField = otpInput('verify_code', t('auth.mfa_enroll.code_label'));
  form.appendChild(codeField.field);

  const errorBox = document.createElement('div');
  errorBox.className = 'auth-error';
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = t('auth.mfa_enroll.submit');
  form.appendChild(submit);

  card.appendChild(form);
  card.appendChild(logoutBtn);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeField.input.value.replace(/\s/g, '');
    void handleVerify(enrolled.factorId, code, { submit, errorBox });
  });
}

async function handleVerify(
  factorId: string,
  code: string,
  ui: { submit: HTMLButtonElement; errorBox: HTMLElement }
): Promise<void> {
  ui.errorBox.hidden = true;

  if (!/^\d{6}$/.test(code)) {
    showError(ui.errorBox, t('auth.mfa_enroll.error_code_format'));
    return;
  }

  setBusy(ui.submit, true);

  const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
    factorId,
  });
  if (challengeErr !== null) {
    setBusy(ui.submit, false);
    reportError('mfa.challenge', challengeErr);
    showError(ui.errorBox, t('auth.mfa_enroll.error_challenge'));
    return;
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyErr !== null) {
    setBusy(ui.submit, false);
    reportError('mfa.verify', verifyErr);
    showError(ui.errorBox, t('auth.mfa_enroll.error_invalid_code'));
    return;
  }

  // Factor geverifieerd; sessie is opgewaardeerd naar aal2. Trigger rerender.
  window.dispatchEvent(new Event('auth:rerender'));
}

async function cleanupUnverifiedFactors(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error !== null) {
      return;
    }
    for (const f of data.all) {
      if (f.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {
          // Best-effort — als unenroll faalt, gaat enroll() er straks alsnog
          // overheen of de admin moet 'Reset 2FA' aanroepen.
        });
      }
    }
  } catch {
    // Best-effort cleanup; mag main-flow niet blokkeren.
  }
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
  input.maxLength = 7; // 6 cijfers + eventuele spatie tussen 3+3
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
