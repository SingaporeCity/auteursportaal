/**
 * Herbruikbare keuze-modal: laat de admin kiezen uit een verzameling tegels.
 * Klik op een tegel sluit de keuze-modal en roept de bij dat tegel horende
 * callback aan (die meestal een gespecialiseerde modal opent).
 *
 * Gebruikt voor:
 *   - Auteur toevoegen → kies "Nieuwe auteur" of "Bestaande auteurs (Excel)"
 *   - Documenten uploaden → kies type (royalty / nevenrechten / contracten /
 *     facturen / etc.)
 *
 * @module views/admin/choice-modal
 */

export interface ChoiceTile {
  id: string;
  label: string;
  description: string;
  /** Inline SVG-string (16-24px viewbox, currentColor stroke). */
  icon: string;
  /** Wordt onder de tegel als disabled-badge getoond. Tegel wordt niet
   *  klikbaar als dit is gezet. */
  comingSoonLabel?: string;
  /** Klik-handler. Niet aangeroepen als `comingSoonLabel` is gezet. */
  onPick: () => void;
}

export interface ChoiceModalOptions {
  title: string;
  intro?: string;
  tiles: ChoiceTile[];
  /** Optionele class op de modal voor scopen van extra styling. */
  modalClassName?: string;
}

export function openChoiceModal(opts: ChoiceModalOptions): void {
  if (document.querySelector('.modal-overlay.choice-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay choice-overlay';

  const modal = document.createElement('div');
  modal.className = `modal choice-modal${opts.modalClassName !== undefined ? ` ${opts.modalClassName}` : ''}`;
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
  heading.textContent = opts.title;
  modal.appendChild(heading);

  if (opts.intro !== undefined && opts.intro !== '') {
    const intro = document.createElement('p');
    intro.className = 'profile-edit-intro';
    intro.textContent = opts.intro;
    modal.appendChild(intro);
  }

  const grid = document.createElement('div');
  grid.className = 'choice-grid';
  modal.appendChild(grid);

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

  for (const tile of opts.tiles) {
    grid.appendChild(buildTile(tile, close));
  }

  document.body.appendChild(overlay);
}

function buildTile(tile: ChoiceTile, closeModal: () => void): HTMLElement {
  const isDisabled = tile.comingSoonLabel !== undefined && tile.comingSoonLabel !== '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `choice-tile${isDisabled ? ' choice-tile--disabled' : ''}`;
  btn.disabled = isDisabled;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'choice-tile-icon';
  // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
  iconWrap.innerHTML = tile.icon;
  btn.appendChild(iconWrap);

  const body = document.createElement('span');
  body.className = 'choice-tile-body';

  const label = document.createElement('span');
  label.className = 'choice-tile-label';
  label.textContent = tile.label;
  body.appendChild(label);

  const desc = document.createElement('span');
  desc.className = 'choice-tile-desc';
  desc.textContent = tile.description;
  body.appendChild(desc);

  if (isDisabled) {
    const badge = document.createElement('span');
    badge.className = 'choice-tile-badge';
    badge.textContent = tile.comingSoonLabel ?? '';
    body.appendChild(badge);
  }

  btn.appendChild(body);

  if (!isDisabled) {
    btn.addEventListener('click', () => {
      closeModal();
      tile.onPick();
    });
  }

  return btn;
}
