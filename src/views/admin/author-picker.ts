/**
 * Admin-modal: kies één auteur uit de lijst — gebruikt door acties die per-
 * auteur uitgevoerd worden vanuit een algemene action-card (bv. contract
 * uploaden vanuit "Statements & contracten" i.p.v. per author-card).
 *
 * UX: focus-trapped overlay met search-input + scroll-list. Klik → callback.
 * Bij grote aantallen auteurs (productie: ~3000) filtert de search client-
 * side over een al-geladen lijst.
 *
 * @module views/admin/author-picker
 */

import type { AuthorRow } from '@/auth';
import { t } from '@/lib/i18n';

export function openAuthorPickerModal(
  authors: AuthorRow[],
  onPick: (author: AuthorRow) => void
): void {
  if (document.querySelector('.modal-overlay.author-picker-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay author-picker-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal author-picker-modal';
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
  heading.textContent = t('admin.author_picker_title');
  modal.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.author_picker_intro');
  modal.appendChild(intro);

  // -- Search-input
  const searchWrap = document.createElement('div');
  searchWrap.className = 'author-picker-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = t('admin.author_picker_search_placeholder');
  searchInput.className = 'author-picker-search-input';
  searchInput.setAttribute('aria-label', t('admin.author_picker_search_placeholder'));
  searchWrap.appendChild(searchInput);
  modal.appendChild(searchWrap);

  // -- List-container (scrollable)
  const list = document.createElement('div');
  list.className = 'author-picker-list';
  list.setAttribute('role', 'listbox');
  modal.appendChild(list);

  const sortable = authors
    .filter((a) => !a.is_admin)
    .sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));

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
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', escHandler);

  const renderRows = (query: string): void => {
    list.replaceChildren();
    const needle = query.trim().toLowerCase();
    const matches =
      needle === ''
        ? sortable
        : sortable.filter((a) => {
            const haystack = `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase();
            return haystack.includes(needle);
          });

    if (matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'author-picker-empty';
      empty.textContent = t('admin.author_picker_empty');
      list.appendChild(empty);
      return;
    }

    for (const a of matches) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'author-picker-row';
      row.setAttribute('role', 'option');

      const avatar = document.createElement('span');
      avatar.className = 'author-picker-avatar';
      const initials =
        `${a.first_name.trim()[0] ?? ''}${a.last_name.trim()[0] ?? ''}`.toUpperCase();
      avatar.textContent = initials === '' ? '·' : initials;
      row.appendChild(avatar);

      const meta = document.createElement('span');
      meta.className = 'author-picker-meta';
      const name = document.createElement('span');
      name.className = 'author-picker-name';
      name.textContent = `${a.first_name} ${a.last_name}`.trim();
      meta.appendChild(name);
      const email = document.createElement('span');
      email.className = 'author-picker-email';
      email.textContent = a.email;
      meta.appendChild(email);
      row.appendChild(meta);

      row.addEventListener('click', () => {
        close();
        onPick(a);
      });
      list.appendChild(row);
    }
  };

  searchInput.addEventListener('input', () => {
    renderRows(searchInput.value);
  });
  renderRows('');

  document.body.appendChild(overlay);
  setTimeout(() => {
    searchInput.focus();
  }, 50);
}
