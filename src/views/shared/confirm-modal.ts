/**
 * Generieke bevestigings-modal voor destructieve of niet-omkeerbare acties.
 *
 * Spiegelt het modal-pattern van `id-koppel-modal.ts` en de
 * activatie-succes-modal: overlay + close-X + ESC-handler + body-append op
 * `document.body`. De `onConfirm`-callback mag async zijn; tijdens uitvoering
 * blijft de modal open met `aria-busy` zodat de gebruiker geen dubbele
 * actie kan triggeren. Errors uit `onConfirm` worden in-modal getoond zodat
 * de gebruiker direct kan retryen of annuleren.
 *
 * @module views/shared/confirm-modal
 */

import { t } from '@/lib/i18n';

export interface ConfirmModalOpts {
  /** Heading bovenaan de modal. */
  title: string;
  /** Body-tekst (één paragraaf, tekst-only). */
  body: string;
  /** Tekst van de bevestig-knop. */
  confirmLabel: string;
  /** Tekst van de annuleer-knop. Default: i18n `common.cancel`. */
  cancelLabel?: string;
  /** Bij true: rode danger-styling op de bevestig-knop. */
  danger?: boolean;
  /**
   * Callback bij bevestiging. Async wordt ondersteund — modal blijft open
   * met spinner tot de promise resolved is, daarna sluit hij automatisch.
   * Bij een thrown error wordt de tekst in de modal getoond en kan de
   * gebruiker opnieuw klikken of annuleren.
   */
  onConfirm: () => Promise<void> | void;
}

export function openConfirmModal(opts: ConfirmModalOpts): void {
  if (document.querySelector('.modal-overlay.confirm-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay confirm-overlay';

  const modal = document.createElement('div');
  modal.className = `modal confirm-modal${opts.danger === true ? ' confirm-modal--danger' : ''}`;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('common.close'));
  modal.appendChild(closeBtn);

  const heading = document.createElement('h3');
  heading.textContent = opts.title;
  modal.appendChild(heading);

  const bodyEl = document.createElement('p');
  bodyEl.className = 'confirm-modal-body';
  bodyEl.textContent = opts.body;
  modal.appendChild(bodyEl);

  const errorBox = document.createElement('div');
  errorBox.className = 'confirm-error';
  errorBox.hidden = true;
  modal.appendChild(errorBox);

  const actions = document.createElement('div');
  actions.className = 'confirm-modal-actions';
  modal.appendChild(actions);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'auth-submit auth-submit-secondary';
  cancelBtn.textContent = opts.cancelLabel ?? t('common.cancel');
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = `auth-submit${opts.danger === true ? ' auth-submit-danger' : ''}`;
  confirmBtn.textContent = opts.confirmLabel;
  actions.appendChild(confirmBtn);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
  };

  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', escHandler);

  confirmBtn.addEventListener('click', () => {
    void runConfirm();
  });

  async function runConfirm(): Promise<void> {
    errorBox.hidden = true;
    errorBox.textContent = '';
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.setAttribute('aria-busy', 'true');
    try {
      await opts.onConfirm();
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errorBox.textContent = msg;
      errorBox.hidden = false;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmBtn.removeAttribute('aria-busy');
    }
  }

  document.body.appendChild(overlay);
  setTimeout(() => {
    confirmBtn.focus();
  }, 50);
}
