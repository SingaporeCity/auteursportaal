/**
 * Profiel-tab: read-only weergave + "Wijzigen"-flow die change_requests maakt
 * voor admin-goedkeuring (geen directe writes naar `authors`).
 *
 * Elk veld dat een pending change_request heeft, krijgt een "⏳ in behandeling"
 * badge — de auteur ziet zo direct welke wijzigingen nog wachten op admin.
 *
 * @module views/tabs/profile
 */

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { formatBSNMasked, formatIBAN, formatPhoneNL, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { isValidEmail, isValidPostcodeNL, isValidIBAN, isValidBSN } from '@/lib/validate';

interface FieldDef {
  name: keyof AuthorRow;
  labelKey: Parameters<typeof t>[0];
  format?: (value: string) => string;
  validate?: (value: string) => boolean;
  validationError?: string;
}

const FIELDS: readonly FieldDef[] = [
  { name: 'first_name', labelKey: 'profile.label_firstname' },
  { name: 'last_name', labelKey: 'profile.label_lastname' },
  {
    name: 'email',
    labelKey: 'profile.label_email',
    validate: isValidEmail,
    validationError: 'Ongeldig e-mailadres',
  },
  { name: 'phone', labelKey: 'profile.label_phone', format: formatPhoneNL },
  { name: 'street', labelKey: 'profile.label_address' },
  { name: 'house_number', labelKey: 'profile.label_postcode' },
  {
    name: 'postcode',
    labelKey: 'profile.label_postcode',
    validate: isValidPostcodeNL,
    validationError: 'Ongeldige postcode (verwacht: 1234 AB)',
  },
  { name: 'city', labelKey: 'profile.label_city' },
  { name: 'country', labelKey: 'profile.label_country' },
  { name: 'birth_date', labelKey: 'profile.label_birthdate', format: formatDate },
  {
    name: 'bsn',
    labelKey: 'profile.label_bsn',
    format: formatBSNMasked,
    validate: isValidBSN,
    validationError: 'Ongeldig BSN',
  },
  {
    name: 'bank_account',
    labelKey: 'profile.label_iban',
    format: formatIBAN,
    validate: isValidIBAN,
    validationError: 'Ongeldig IBAN',
  },
  { name: 'bic', labelKey: 'profile.label_bic' },
];

export function renderProfileTab(container: HTMLElement, author: AuthorRow): void {
  const heading = document.createElement('h2');
  heading.textContent = t('profile.title');
  container.appendChild(heading);

  const banner = document.createElement('div');
  banner.className = 'id-banner';
  banner.appendChild(idChip('profile.id_vendor', author.netsuite_vendor_id));
  banner.appendChild(idChip('profile.id_alliant', author.alliant_id));
  container.appendChild(banner);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'profile-edit-btn';
  editBtn.textContent = t('common.edit');
  container.appendChild(editBtn);

  const grid = document.createElement('div');
  grid.className = 'profile-grid';
  container.appendChild(grid);

  void renderViewMode(grid, author);

  editBtn.addEventListener('click', () => {
    openEditModal(author, () => {
      void renderViewMode(grid, author);
    });
  });
}

function openEditModal(author: AuthorRow, onSaved: () => void): void {
  // Voorkom dubbele modal
  const existing = document.querySelector('.modal-overlay');
  if (existing !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Sluiten');
  modal.appendChild(closeBtn);

  modal.appendChild(
    buildEditForm(author, () => {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      onSaved();
    })
  );

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);

  // Focus eerste input
  const firstInput = modal.querySelector<HTMLInputElement>('input');
  if (firstInput !== null) {
    firstInput.focus();
  }
}

async function renderViewMode(grid: HTMLElement, author: AuthorRow): Promise<void> {
  // Pending change_requests ophalen om badges te kunnen zetten
  const { data: pending } = await supabase
    .from('change_requests')
    .select('field_name, new_value')
    .eq('author_id', author.id)
    .eq('status', 'pending');

  const pendingByField = new Map<string, string>();
  pending?.forEach((cr) => {
    if (cr.new_value !== null) {
      pendingByField.set(cr.field_name, cr.new_value);
    }
  });

  grid.replaceChildren();
  for (const field of FIELDS) {
    grid.appendChild(buildRow(author, field, pendingByField));
  }
}

function buildRow(
  author: AuthorRow,
  field: FieldDef,
  pendingByField: Map<string, string>
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'profile-row';

  const label = document.createElement('div');
  label.className = 'profile-label';
  label.textContent = t(field.labelKey);

  const value = document.createElement('div');
  value.className = 'profile-value';

  const raw = author[field.name];
  const stringValue = typeof raw === 'string' ? raw : raw === null ? '' : String(raw);
  if (stringValue === '') {
    value.classList.add('profile-missing');
    value.textContent = t('common.missing');
  } else {
    value.textContent = field.format ? field.format(stringValue) : stringValue;
  }

  wrap.appendChild(label);
  wrap.appendChild(value);

  const pending = pendingByField.get(field.name);
  if (pending !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'profile-pending-badge';
    badge.textContent = `⏳ wijziging in behandeling: ${pending}`;
    wrap.appendChild(badge);
  }

  return wrap;
}

function idChip(labelKey: Parameters<typeof t>[0], value: string | null): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'id-chip';

  const label = document.createElement('span');
  label.className = 'id-chip-label';
  label.textContent = t(labelKey);

  const val = document.createElement('span');
  val.className = 'id-chip-value';
  val.textContent = value !== null && value !== '' ? value : t('common.missing');

  chip.appendChild(label);
  chip.appendChild(val);
  return chip;
}

function buildEditForm(author: AuthorRow, onDone: () => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'profile-edit-form';

  const heading = document.createElement('h3');
  heading.textContent = 'Wijzigingen aanvragen';
  form.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent =
    'Wijzigingen worden eerst door de uitgever beoordeeld. Pas na goedkeuring zijn ze definitief.';
  form.appendChild(intro);

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  form.appendChild(status);

  const inputs = new Map<string, HTMLInputElement>();
  for (const field of FIELDS) {
    const wrap = document.createElement('label');
    wrap.className = 'auth-field';
    const span = document.createElement('span');
    span.textContent = t(field.labelKey);
    wrap.appendChild(span);

    const input = document.createElement('input');
    input.type = 'text';
    input.name = field.name;
    const raw = author[field.name];
    input.value = typeof raw === 'string' ? raw : raw === null ? '' : String(raw);
    wrap.appendChild(input);

    inputs.set(field.name, input);
    form.appendChild(wrap);
  }

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = t('common.save');
  form.appendChild(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitChanges(author, inputs, status, submit, onDone);
  });

  return form;
}

async function submitChanges(
  author: AuthorRow,
  inputs: Map<string, HTMLInputElement>,
  status: HTMLElement,
  submit: HTMLButtonElement,
  onDone: () => void
): Promise<void> {
  const changes: { field_name: string; old_value: string | null; new_value: string }[] = [];

  for (const field of FIELDS) {
    const input = inputs.get(field.name);
    if (input === undefined) {
      continue;
    }
    const newVal = input.value.trim();
    const raw = author[field.name];
    const oldVal = typeof raw === 'string' ? raw : raw === null ? '' : String(raw);

    if (newVal === oldVal) {
      continue;
    }

    if (field.validate && newVal.length > 0 && !field.validate(newVal)) {
      showStatus(
        status,
        'error',
        field.validationError ?? `Ongeldige waarde voor ${t(field.labelKey)}`
      );
      return;
    }

    changes.push({
      field_name: field.name,
      old_value: oldVal === '' ? null : oldVal,
      new_value: newVal,
    });
  }

  if (changes.length === 0) {
    showStatus(status, 'error', 'Geen wijzigingen aangebracht.');
    return;
  }

  submit.disabled = true;

  const rows = changes.map((c) => ({
    author_id: author.id,
    field_name: c.field_name,
    old_value: c.old_value,
    new_value: c.new_value,
    status: 'pending' as const,
  }));

  const { error } = await supabase.from('change_requests').insert(rows);
  submit.disabled = false;

  if (error !== null) {
    reportError('profile.changeRequest', error);
    showStatus(status, 'error', `Indienen faalde: ${error.message}`);
    return;
  }

  showStatus(
    status,
    'success',
    `${String(changes.length)} wijziging(en) ingediend. De uitgever beoordeelt deze.`
  );
  setTimeout(onDone, 1500);
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
