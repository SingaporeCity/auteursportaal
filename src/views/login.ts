/**
 * Login-pagina (split-screen: brand-panel links, form rechts).
 *
 * Drie sub-flows:
 * - Standaard email + password login
 * - "Wachtwoord vergeten" — vraagt recovery-mail aan
 * - Microsoft SSO (admin) — alleen zichtbaar als `VITE_ADMIN_SSO_ENABLED=true`
 *
 * Toont nette error-states i.p.v. native alerts. Side effects van een
 * succesvolle login worden via Supabase' `onAuthStateChange` opgevangen
 * in `main.ts` — deze view zelf hoeft niets te navigeren.
 *
 * @module views/login
 */

import {
  signInWithPassword,
  requestPasswordReset,
  isAdminSsoEnabled,
  signInWithAzure,
} from '@/auth';
import { isValidEmail } from '@/lib/validate';
import { t } from '@/lib/i18n';

type SubFlow = 'login' | 'forgot' | 'forgot_sent';

export function renderLoginView(root: HTMLElement): void {
  root.replaceChildren();
  let flow: SubFlow = 'login';

  const wrapper = el('div', 'auth-wrapper');
  wrapper.appendChild(buildBrandPanel());

  const formPanel = el('section', 'auth-form-panel');
  wrapper.appendChild(formPanel);
  root.appendChild(wrapper);

  function repaint(): void {
    formPanel.replaceChildren();
    if (flow === 'login') {
      formPanel.appendChild(
        buildLoginForm({
          onForgotClick: () => {
            switchTo('forgot');
          },
        })
      );
    } else if (flow === 'forgot') {
      formPanel.appendChild(
        buildForgotForm({
          onCancel: () => {
            switchTo('login');
          },
          onSent: () => {
            switchTo('forgot_sent');
          },
        })
      );
    } else {
      formPanel.appendChild(
        buildForgotSent({
          onBack: () => {
            switchTo('login');
          },
        })
      );
    }
  }

  function switchTo(next: SubFlow): void {
    flow = next;
    repaint();
  }

  repaint();
}

// =============================================================================
// Brand panel (links)
// =============================================================================
function buildBrandPanel(): HTMLElement {
  const panel = el('aside', 'auth-brand-panel');

  const wrap = el('div', 'auth-brand-inner');
  const title = el('h1', 'auth-brand-title');
  title.textContent = t('app.title');
  const subtitle = el('p', 'auth-brand-subtitle');
  subtitle.textContent = t('app.tagline');

  wrap.appendChild(title);
  wrap.appendChild(subtitle);
  panel.appendChild(wrap);
  return panel;
}

// =============================================================================
// Login form
// =============================================================================
function buildLoginForm({ onForgotClick }: { onForgotClick: () => void }): HTMLElement {
  const card = el('div', 'auth-card');

  const heading = el('h2');
  heading.textContent = t('auth.login.title');
  card.appendChild(heading);

  const subtitle = el('p', 'auth-subtitle');
  subtitle.textContent = t('auth.login.subtitle');
  card.appendChild(subtitle);

  const form = document.createElement('form');
  form.noValidate = true;

  const emailInput = textInput('email', t('auth.login.email_label'), 'email');
  const passwordInput = textInput('password', t('auth.login.password_label'), 'current-password');
  form.appendChild(emailInput.field);
  form.appendChild(passwordInput.field);

  const errorBox = el('div', 'auth-error');
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const submitBtn = el('button', 'auth-submit');
  submitBtn.setAttribute('type', 'submit');
  submitBtn.textContent = t('auth.login.submit');
  form.appendChild(submitBtn);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleLogin(emailInput.input.value.trim(), passwordInput.input.value, {
      submitBtn,
      errorBox,
    });
  });

  card.appendChild(form);

  const forgotLink = el('button', 'auth-link');
  forgotLink.setAttribute('type', 'button');
  forgotLink.textContent = t('auth.login.forgot_password');
  forgotLink.addEventListener('click', onForgotClick);
  card.appendChild(forgotLink);

  card.appendChild(buildSsoSection());

  return card;
}

async function handleLogin(
  email: string,
  password: string,
  ui: { submitBtn: HTMLElement; errorBox: HTMLElement }
): Promise<void> {
  ui.errorBox.hidden = true;

  if (!isValidEmail(email)) {
    showError(ui.errorBox, t('auth.login.error_invalid'));
    return;
  }
  if (password.length < 1) {
    showError(ui.errorBox, t('auth.login.error_invalid'));
    return;
  }

  setBusy(ui.submitBtn, true);
  const result = await signInWithPassword(email, password);
  setBusy(ui.submitBtn, false);

  if (result.success) {
    return;
  }
  if (result.error === 'invalid_credentials') {
    showError(ui.errorBox, t('auth.login.error_invalid'));
  } else {
    showError(ui.errorBox, t('auth.login.error_generic'));
  }
}

// =============================================================================
// Forgot password form
// =============================================================================
function buildForgotForm({
  onCancel,
  onSent,
}: {
  onCancel: () => void;
  onSent: () => void;
}): HTMLElement {
  const card = el('div', 'auth-card');

  const heading = el('h2');
  heading.textContent = t('auth.login.forgot_password');
  card.appendChild(heading);

  const form = document.createElement('form');
  form.noValidate = true;

  const emailInput = textInput('email', t('auth.login.email_label'), 'email');
  form.appendChild(emailInput.field);

  const errorBox = el('div', 'auth-error');
  errorBox.hidden = true;
  form.appendChild(errorBox);

  const submitBtn = el('button', 'auth-submit');
  submitBtn.setAttribute('type', 'submit');
  submitBtn.textContent = t('auth.login.submit');
  form.appendChild(submitBtn);

  const cancelBtn = el('button', 'auth-link');
  cancelBtn.setAttribute('type', 'button');
  cancelBtn.textContent = t('common.cancel');
  cancelBtn.addEventListener('click', onCancel);
  form.appendChild(cancelBtn);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = emailInput.input.value.trim();
    if (!isValidEmail(email)) {
      showError(errorBox, t('auth.login.error_invalid'));
      return;
    }
    setBusy(submitBtn, true);
    void requestPasswordReset(email).then(() => {
      setBusy(submitBtn, false);
      onSent();
    });
  });

  card.appendChild(form);
  return card;
}

function buildForgotSent({ onBack }: { onBack: () => void }): HTMLElement {
  const card = el('div', 'auth-card');
  const heading = el('h2');
  heading.textContent = '✉️';
  card.appendChild(heading);

  const msg = el('p');
  msg.textContent =
    'Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een link om een nieuw wachtwoord in te stellen.';
  card.appendChild(msg);

  const back = el('button', 'auth-link');
  back.setAttribute('type', 'button');
  back.textContent = '← terug naar inloggen';
  back.addEventListener('click', onBack);
  card.appendChild(back);

  return card;
}

// =============================================================================
// SSO section (admin only, gated)
// =============================================================================
function buildSsoSection(): HTMLElement {
  const wrap = el('div', 'auth-sso');
  const divider = el('div', 'auth-divider');
  divider.textContent = 'OF';
  wrap.appendChild(divider);

  const ssoBtn = el('button', 'auth-sso-btn');
  ssoBtn.setAttribute('type', 'button');
  ssoBtn.textContent = t('auth.login.admin_sso');

  if (!isAdminSsoEnabled()) {
    ssoBtn.setAttribute('disabled', 'disabled');
    ssoBtn.classList.add('auth-sso-disabled');
    const notice = el('small', 'auth-sso-notice');
    notice.textContent = t('auth.login.admin_sso_disabled_notice');
    wrap.appendChild(ssoBtn);
    wrap.appendChild(notice);
  } else {
    ssoBtn.addEventListener('click', () => {
      void signInWithAzure();
    });
    wrap.appendChild(ssoBtn);
  }
  return wrap;
}

// =============================================================================
// Helpers
// =============================================================================
function el<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className?: string
): HTMLElementTagNameMap[T] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  return node;
}

function textInput(
  name: 'email' | 'password',
  label: string,
  autocomplete: AutoFill
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = name === 'password' ? 'password' : 'email';
  input.name = name;
  input.required = true;
  input.autocomplete = autocomplete;
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
