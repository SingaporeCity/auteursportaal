/**
 * Profiel-tab — drie modi op basis van `author.onboarding_status`:
 *
 *  - `pending_data` — onboarding-form: alle velden direct editable, tussentijds
 *    opslaan via directe UPDATE op `authors` (RLS-policy `authors_update_own`),
 *    "Activeer mijn account"-knop wordt enabled zodra alle 13 verplichte velden
 *    valide ingevuld zijn. Klik triggert status-overgang naar `pending_admin_review`
 *    (DB-trigger zet `data_submitted_at` automatisch).
 *
 *  - `pending_admin_review` — read-only weergave met disclaimer "uw aanvraag
 *    wordt beoordeeld". Geen edit-knop.
 *
 *  - `active` — huidige flow: read-only met "Wijzigen"-knop die change_requests
 *    aanmaakt voor admin-goedkeuring.
 *
 * @module views/tabs/profile
 */

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import { formatBSNMasked, formatIBAN, formatPhoneNL, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { isValidEmail, isValidPostcodeNL, isValidIBAN, isValidBSN } from '@/lib/validate';
import type { Database } from '@/types/db';

type AuthorUpdate = Database['public']['Tables']['authors']['Update'];

/**
 * Velden die NA eerste invoer niet meer wijzigbaar zijn (security-policy).
 * Worden uitgesloten uit `change_requests`-flow en uit directe-write-pad.
 * DB-trigger 0010 is de hardste laag — deze constante is defense-in-depth UX.
 */
const IMMUTABLE_FIELDS: ReadonlySet<keyof AuthorRow> = new Set(['bsn']);

/** Hoe lang BSN zichtbaar blijft na "Toon BSN" klik (ms). */
const BSN_REVEAL_MS = 30_000;

interface FieldDef {
  name: keyof AuthorRow;
  labelKey: Parameters<typeof t>[0];
  format?: (value: string) => string;
  validate?: (value: string) => boolean;
  validationError?: string;
  /** Verplicht voor activatie. */
  required: boolean;
  /** Niet bewerkbaar door auteur (bijv. email = auth-key). */
  readonly?: boolean;
  /** Input-type voor onboarding-form. */
  inputType?: 'text' | 'email' | 'tel' | 'date';
}

const FIELDS: readonly FieldDef[] = [
  { name: 'first_name', labelKey: 'profile.label_firstname', required: true },
  { name: 'last_name', labelKey: 'profile.label_lastname', required: true },
  {
    name: 'email',
    labelKey: 'profile.label_email',
    validate: isValidEmail,
    validationError: 'Ongeldig e-mailadres',
    required: true,
    readonly: true,
    inputType: 'email',
  },
  {
    name: 'phone',
    labelKey: 'profile.label_phone',
    format: formatPhoneNL,
    required: true,
    inputType: 'tel',
  },
  { name: 'street', labelKey: 'profile.label_address', required: true },
  { name: 'house_number', labelKey: 'profile.label_postcode', required: true },
  {
    name: 'postcode',
    labelKey: 'profile.label_postcode',
    validate: isValidPostcodeNL,
    validationError: 'Ongeldige postcode (verwacht: 1234 AB)',
    required: true,
  },
  { name: 'city', labelKey: 'profile.label_city', required: true },
  { name: 'country', labelKey: 'profile.label_country', required: true },
  {
    name: 'birth_date',
    labelKey: 'profile.label_birthdate',
    format: formatDate,
    required: true,
    inputType: 'date',
  },
  {
    name: 'bsn',
    labelKey: 'profile.label_bsn',
    format: formatBSNMasked,
    validate: isValidBSN,
    validationError: 'Ongeldig BSN',
    required: true,
  },
  {
    name: 'bank_account',
    labelKey: 'profile.label_iban',
    format: formatIBAN,
    validate: isValidIBAN,
    validationError: 'Ongeldig IBAN',
    required: true,
  },
  { name: 'bic', labelKey: 'profile.label_bic', required: true },
];

export function renderProfileTab(container: HTMLElement, author: AuthorRow): void {
  container.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = t('profile.title');
  container.appendChild(heading);

  // Vendor en Alliant ID zijn admin-velden (NetSuite-koppeling). Auteur
  // ziet ze pas wanneer zijn account daadwerkelijk actief is — vóór die
  // tijd is "ontbreekt" verwarrend want het auteur kan ze toch niet zelf
  // invullen.
  if (author.onboarding_status === 'active') {
    const banner = document.createElement('div');
    banner.className = 'id-banner';
    banner.appendChild(idChip('profile.id_vendor', author.netsuite_vendor_id));
    banner.appendChild(idChip('profile.id_alliant', author.alliant_id));
    container.appendChild(banner);
  }

  if (author.onboarding_status === 'pending_data') {
    renderOnboardingMode(container, author);
    return;
  }

  if (author.onboarding_status === 'pending_admin_review') {
    renderReviewPendingMode(container, author);
    return;
  }

  renderActiveMode(container, author);
}

// =============================================================================
// Mode: active — huidige change_requests-flow
// =============================================================================
function renderActiveMode(container: HTMLElement, author: AuthorRow): void {
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

// =============================================================================
// Mode: pending_admin_review — read-only met disclaimer
// =============================================================================
function renderReviewPendingMode(container: HTMLElement, author: AuthorRow): void {
  const disclaimer = document.createElement('div');
  disclaimer.className = 'profile-readonly-disclaimer';
  disclaimer.textContent = t('onboarding.readonly_disclaimer');
  container.appendChild(disclaimer);

  const grid = document.createElement('div');
  grid.className = 'profile-grid';
  container.appendChild(grid);

  void renderViewMode(grid, author);
}

// =============================================================================
// Mode: pending_data — onboarding-form met directe UPDATE + activeer-knop
// =============================================================================
function renderOnboardingMode(container: HTMLElement, author: AuthorRow): void {
  const form = document.createElement('form');
  form.className = 'profile-onboarding-form';
  form.noValidate = true;

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  form.appendChild(status);

  const inputs = new Map<keyof AuthorRow, HTMLInputElement>();

  // Werkbare snapshot — wijzigt bij elke save zodat activeer-validatie klopt
  const workingAuthor: AuthorRow = { ...author };

  for (const field of FIELDS) {
    const wrap = document.createElement('label');
    wrap.className = 'auth-field';

    const labelRow = document.createElement('span');
    labelRow.className = 'auth-field-label';
    labelRow.textContent = t(field.labelKey);
    if (field.required) {
      const required = document.createElement('span');
      required.className = 'auth-field-required';
      required.textContent = ' *';
      required.title = t('onboarding.required_field_hint');
      labelRow.appendChild(required);
    }
    wrap.appendChild(labelRow);

    const input = document.createElement('input');
    input.type = field.inputType ?? 'text';
    input.name = field.name;
    const raw = author[field.name];
    input.value = typeof raw === 'string' ? raw : raw === null ? '' : String(raw);
    if (field.readonly === true) {
      input.readOnly = true;
      input.classList.add('auth-field-readonly');
    }
    wrap.appendChild(input);

    input.addEventListener('input', () => {
      updateActivateButtonState();
    });

    inputs.set(field.name, input);
    form.appendChild(wrap);
  }

  // Action-row: Tussentijds opslaan + Activeer mijn account
  const actions = document.createElement('div');
  actions.className = 'profile-onboarding-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'auth-submit auth-submit-secondary';
  saveBtn.textContent = t('onboarding.save_intermediate');
  actions.appendChild(saveBtn);

  const activateBtn = document.createElement('button');
  activateBtn.type = 'button';
  activateBtn.className = 'auth-submit';
  activateBtn.textContent = t('onboarding.activate_button');
  actions.appendChild(activateBtn);

  const missingHint = document.createElement('p');
  missingHint.className = 'profile-onboarding-missing-hint';
  actions.appendChild(missingHint);

  form.appendChild(actions);
  container.appendChild(form);

  function gatherInputValues(): Map<keyof AuthorRow, string> {
    const out = new Map<keyof AuthorRow, string>();
    for (const [name, input] of inputs) {
      out.set(name, input.value.trim());
    }
    return out;
  }

  function countMissingOrInvalidRequired(): number {
    const values = gatherInputValues();
    let count = 0;
    for (const field of FIELDS) {
      if (!field.required) {
        continue;
      }
      const val = values.get(field.name) ?? '';
      if (val === '') {
        count++;
        continue;
      }
      if (field.validate !== undefined && !field.validate(val)) {
        count++;
      }
    }
    return count;
  }

  function updateActivateButtonState(): void {
    const missing = countMissingOrInvalidRequired();
    if (missing === 0) {
      activateBtn.disabled = false;
      activateBtn.removeAttribute('aria-disabled');
      missingHint.textContent = '';
      return;
    }
    activateBtn.disabled = true;
    activateBtn.setAttribute('aria-disabled', 'true');
    missingHint.textContent = t('onboarding.missing_fields_count').replace(
      '{count}',
      String(missing)
    );
  }

  saveBtn.addEventListener('click', () => {
    void saveOnboardingData(workingAuthor, inputs, status, saveBtn, false);
  });

  activateBtn.addEventListener('click', () => {
    void saveOnboardingData(workingAuthor, inputs, status, activateBtn, true).then((ok) => {
      if (ok) {
        void requestActivation(workingAuthor, status, activateBtn);
      }
      return undefined;
    });
  });

  updateActivateButtonState();
}

async function saveOnboardingData(
  author: AuthorRow,
  inputs: Map<keyof AuthorRow, HTMLInputElement>,
  status: HTMLElement,
  submit: HTMLButtonElement,
  silentOnSuccess: boolean
): Promise<boolean> {
  // Verzamel alleen-gewijzigde + valide velden in een type-safe Update-object
  const update: AuthorUpdate = {};
  let changed = 0;
  for (const field of FIELDS) {
    if (field.readonly === true) {
      continue;
    }
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

    if (field.validate !== undefined && newVal.length > 0 && !field.validate(newVal)) {
      showStatus(
        status,
        'error',
        field.validationError ?? `Ongeldige waarde voor ${t(field.labelKey)}`
      );
      return false;
    }

    assignAuthorField(update, field.name, newVal === '' ? null : newVal);
    changed++;
  }

  if (changed === 0) {
    if (!silentOnSuccess) {
      showStatus(status, 'success', t('profile.changes_nothing'));
    }
    return true;
  }

  submit.disabled = true;
  const { error } = await supabase.from('authors').update(update).eq('id', author.id);
  submit.disabled = false;

  if (error !== null) {
    reportError('profile.onboardingSave', error);
    showStatus(status, 'error', `Opslaan faalde: ${error.message}`);
    return false;
  }

  // Update lokale snapshot zodat volgende save juiste oldVal heeft
  for (const field of FIELDS) {
    const input = inputs.get(field.name);
    if (input === undefined) {
      continue;
    }
    (author as Record<string, unknown>)[field.name] = input.value.trim();
  }

  if (!silentOnSuccess) {
    showStatus(status, 'success', t('profile.changes_saved'));
  }
  return true;
}

async function requestActivation(
  author: AuthorRow,
  status: HTMLElement,
  submit: HTMLButtonElement
): Promise<void> {
  submit.disabled = true;
  const { error } = await supabase
    .from('authors')
    .update({ onboarding_status: 'pending_admin_review' })
    .eq('id', author.id);

  if (error !== null) {
    submit.disabled = false;
    reportError('profile.requestActivation', error);
    showStatus(status, 'error', `Activeren faalde: ${error.message}`);
    return;
  }

  showStatus(status, 'success', t('onboarding.activate_confirmation'));
  // Herlaad zodat decideAccess opnieuw evalueert + onboarding-banner update
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}

// =============================================================================
// Modal-flow voor active-mode (change_requests)
// =============================================================================
function openEditModal(author: AuthorRow, onSaved: () => void): void {
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

  const firstInput = modal.querySelector<HTMLInputElement>('input');
  if (firstInput !== null) {
    firstInput.focus();
  }
}

async function renderViewMode(grid: HTMLElement, author: AuthorRow): Promise<void> {
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

  // BSN: "Toon BSN" toggle (30s zichtbaar, dan auto-mask) + immutable-hint
  if (field.name === 'bsn' && stringValue !== '') {
    wrap.appendChild(buildBsnToggle(value, stringValue));
    const hint = document.createElement('span');
    hint.className = 'profile-immutable-hint';
    hint.textContent = t('profile.bsn_immutable_hint');
    wrap.appendChild(hint);
  }

  const pending = pendingByField.get(field.name);
  if (pending !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'profile-pending-badge';
    badge.textContent = t('profile.pending_change_badge').replace('{value}', pending);
    wrap.appendChild(badge);
  }

  return wrap;
}

/**
 * "Toon BSN" toggle — vervangt masked weergave kortstondig door volledige BSN.
 * Geen audit-log: dit is eigen data, AVG-art-15 inzagerecht — geen administratieve
 * actie die logging vereist.
 */
function buildBsnToggle(valueCell: HTMLElement, fullBsn: string): HTMLButtonElement {
  const masked = formatBSNMasked(fullBsn);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bsn-toggle-btn';
  btn.textContent = t('profile.bsn_show');
  btn.setAttribute('aria-label', t('profile.bsn_show'));

  let revealed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const mask = (): void => {
    valueCell.textContent = masked;
    valueCell.classList.remove('bsn-revealed');
    btn.textContent = t('profile.bsn_show');
    revealed = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const reveal = (): void => {
    valueCell.textContent = fullBsn;
    valueCell.classList.add('bsn-revealed');
    btn.textContent = t('profile.bsn_hide');
    revealed = true;
    timer = setTimeout(mask, BSN_REVEAL_MS);
  };

  btn.addEventListener('click', () => {
    if (revealed) {
      mask();
    } else {
      reveal();
    }
  });

  return btn;
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
  heading.textContent = t('profile.changes_heading');
  form.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('profile.changes_intro');
  form.appendChild(intro);

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  form.appendChild(status);

  const inputs = new Map<string, HTMLInputElement>();
  for (const field of FIELDS) {
    if (field.readonly === true) {
      continue;
    }
    // BSN + andere immutable-velden niet in change-request flow — kunnen niet
    // gewijzigd worden na eerste invoer (DB-trigger 0010 enforced).
    if (IMMUTABLE_FIELDS.has(field.name)) {
      continue;
    }
    const wrap = document.createElement('label');
    wrap.className = 'auth-field';
    const span = document.createElement('span');
    span.textContent = t(field.labelKey);
    wrap.appendChild(span);

    const input = document.createElement('input');
    input.type = field.inputType ?? 'text';
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
    if (field.readonly === true) {
      continue;
    }
    if (IMMUTABLE_FIELDS.has(field.name)) {
      // Defense-in-depth: voorkom change_request-INSERT met immutable veld zelfs
      // als attacker DOM gemodificeerd heeft. DB-trigger 0010 zou de UPDATE
      // alsnog blokkeren — dit voorkomt een onnodige rij in change_requests.
      continue;
    }
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

    if (field.validate !== undefined && newVal.length > 0 && !field.validate(newVal)) {
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
    showStatus(status, 'error', t('profile.changes_empty'));
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
    t('profile.changes_submitted').replace('{count}', String(changes.length))
  );
  setTimeout(onDone, 1500);
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}

/**
 * Type-safe assign: zet alleen velden die als `string | null` op `AuthorUpdate`
 * staan. Onbekende velden worden stilzwijgend genegeerd (kan niet voorkomen in
 * de FIELDS-array maar TS kan het niet bewijzen).
 */
function assignAuthorField(
  update: AuthorUpdate,
  name: keyof AuthorRow,
  value: string | null
): void {
  // Whitelist van velden die we vanuit het profiel mogen schrijven.
  // Email + ID-kolommen + status-velden niet via dit pad. BSN is niet writable
  // bij elke save — wel toegestaan op `pending_data` (eerste invoer) — daar
  // wordt assignAuthorField uitsluitend tijdens onboarding aangeroepen, en
  // DB-trigger 0010 forceert immutability bovendien op database-niveau.
  // BSN staat hier nog wél in de set, omdat eerste invoer mogelijk moet zijn.
  // Voor active-mode worden ALLE schrijfacties via change_requests gerouteerd
  // (zie buildEditForm), waar IMMUTABLE_FIELDS BSN expliciet uitsluit.
  const writable: ReadonlySet<keyof AuthorRow> = new Set([
    'first_name',
    'last_name',
    'phone',
    'street',
    'house_number',
    'postcode',
    'city',
    'country',
    'birth_date',
    'bsn',
    'bank_account',
    'bic',
  ]);
  if (!writable.has(name)) {
    return;
  }
  // We weten op basis van de set hierboven dat deze velden allemaal `string | null` zijn.
  (update as Record<string, string | null>)[name] = value;
}
