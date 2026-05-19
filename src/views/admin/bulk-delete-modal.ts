/**
 * Modal voor bulk-verwijderen van auteurs vanuit de admin-bulk-bar.
 *
 * Drie fases binnen één modal-instance:
 *   1. Confirm — toont aantal + namen-preview, danger-confirm.
 *   2. Busy   — toont voortgang "Bezig met verwijderen (3 van 10)…".
 *   3. Result — toont succes-count + lijst gefaalde IDs (max 5 zichtbaar).
 *
 * De Edge Function `delete-author` wordt sequentieel aangeroepen per ID;
 * één call faalt = die specifieke auteur blijft in selectedIds + DB,
 * andere gaan gewoon door. Self-delete wordt aan server-zijde geblokkeerd
 * (400 cannot_delete_self) en als gefaalde rij teruggegeven.
 *
 * @module views/admin/bulk-delete-modal
 */

import type { AuthorRow } from '@/auth';
import { deleteAuthor } from '@/lib/delete-author';
import { t } from '@/lib/i18n';

interface BulkDeleteOpts {
  authors: AuthorRow[];
  /** Roept terug welke IDs succesvol verwijderd zijn (zodat state mag opruimen). */
  onComplete: (deletedIds: string[]) => void;
}

const NAMES_PREVIEW_LIMIT = 5;

export function openBulkDeleteModal(opts: BulkDeleteOpts): void {
  if (document.querySelector('.modal-overlay.bulk-delete-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay bulk-delete-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal confirm-modal confirm-modal--danger bulk-delete-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('common.close'));
  modal.appendChild(closeBtn);

  // === Fase 1: Confirm ===
  const heading = document.createElement('h3');
  heading.textContent = t('admin.bulk_delete_heading').replace(
    '{count}',
    String(opts.authors.length)
  );
  modal.appendChild(heading);

  const body = document.createElement('p');
  body.className = 'confirm-modal-body';
  body.textContent = t('admin.bulk_delete_body').replace('{count}', String(opts.authors.length));
  modal.appendChild(body);

  const preview = document.createElement('ul');
  preview.className = 'bulk-delete-preview';
  const visibleNames = opts.authors.slice(0, NAMES_PREVIEW_LIMIT);
  for (const a of visibleNames) {
    const li = document.createElement('li');
    li.textContent = `${a.first_name} ${a.last_name}`.trim() || a.email;
    preview.appendChild(li);
  }
  if (opts.authors.length > NAMES_PREVIEW_LIMIT) {
    const more = document.createElement('li');
    more.className = 'bulk-delete-preview-more';
    more.textContent = t('admin.bulk_delete_preview_more').replace(
      '{n}',
      String(opts.authors.length - NAMES_PREVIEW_LIMIT)
    );
    preview.appendChild(more);
  }
  modal.appendChild(preview);

  const progress = document.createElement('div');
  progress.className = 'bulk-delete-progress';
  progress.hidden = true;
  modal.appendChild(progress);

  const errorList = document.createElement('ul');
  errorList.className = 'bulk-delete-errors';
  errorList.hidden = true;
  modal.appendChild(errorList);

  const actions = document.createElement('div');
  actions.className = 'confirm-modal-actions';
  modal.appendChild(actions);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'auth-submit auth-submit-secondary';
  cancelBtn.textContent = t('common.cancel');
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'auth-submit auth-submit-danger';
  confirmBtn.textContent = t('admin.bulk_delete_confirm');
  actions.appendChild(confirmBtn);

  let deletedIds: string[] = [];

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    // Geef terug welke IDs succesvol verwijderd zijn — caller kan state opruimen.
    opts.onComplete(deletedIds);
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
    void runBulkDelete();
  });

  async function runBulkDelete(): Promise<void> {
    // Switch naar busy-mode
    preview.hidden = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.setAttribute('aria-busy', 'true');
    progress.hidden = false;

    const failed: { id: string; name: string; message: string }[] = [];
    const succeeded: string[] = [];

    for (let i = 0; i < opts.authors.length; i++) {
      const author = opts.authors[i];
      if (author === undefined) {
        continue;
      }
      progress.textContent = t('admin.bulk_delete_progress')
        .replace('{current}', String(i + 1))
        .replace('{total}', String(opts.authors.length));
      try {
        await deleteAuthor(author.id);
        succeeded.push(author.id);
      } catch (e) {
        failed.push({
          id: author.id,
          name: `${author.first_name} ${author.last_name}`.trim() || author.email,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    deletedIds = succeeded;

    // Switch naar result-mode
    progress.hidden = true;
    confirmBtn.removeAttribute('aria-busy');
    confirmBtn.hidden = true;
    cancelBtn.disabled = false;
    cancelBtn.textContent = t('common.close');

    heading.textContent = t('admin.bulk_delete_result_heading');
    body.textContent = t('admin.bulk_delete_result_body')
      .replace('{success}', String(succeeded.length))
      .replace('{total}', String(opts.authors.length));

    if (failed.length > 0) {
      errorList.replaceChildren();
      for (const f of failed.slice(0, NAMES_PREVIEW_LIMIT)) {
        const li = document.createElement('li');
        li.textContent = `${f.name}: ${f.message}`;
        errorList.appendChild(li);
      }
      if (failed.length > NAMES_PREVIEW_LIMIT) {
        const more = document.createElement('li');
        more.className = 'bulk-delete-preview-more';
        more.textContent = t('admin.bulk_delete_preview_more').replace(
          '{n}',
          String(failed.length - NAMES_PREVIEW_LIMIT)
        );
        errorList.appendChild(more);
      }
      errorList.hidden = false;
    }
  }

  document.body.appendChild(overlay);
  setTimeout(() => {
    confirmBtn.focus();
  }, 50);
}
