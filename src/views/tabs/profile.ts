/**
 * Profiel-tab — drie modi op basis van `author.onboarding_status`:
 *
 *  - `pending_data` — onboarding-form: alle velden direct editable, tussentijds
 *    opslaan via directe UPDATE op `authors` (RLS-policy `authors_update_own`),
 *    "Activeer mijn account"-knop wordt enabled zodra alle 13 verplichte velden
 *    valide ingevuld zijn. Klik triggert status-overgang naar `pending_admin_review`
 *    (DB-trigger zet `data_submitted_at` automatisch).
 *
 *    Live per-veld validatie (blur-triggered), placeholders met format-hints,
 *    en een in-memory draft-cache zodat ingetypte waarden behouden blijven bij
 *    tab-switch / partiele re-render binnen dezelfde sessie.
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
import type { TranslationKey } from '@/i18n/types';

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
  labelKey: TranslationKey;
  /** Placeholder met format-hint (bv. "1234 AB" voor postcode). */
  placeholderKey?: TranslationKey;
  format?: (value: string) => string;
  validate?: (value: string) => boolean;
  /** i18n-key voor validatie-foutmelding; valt terug op `field_invalid` als undefined. */
  validationErrorKey?: TranslationKey;
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
    validationErrorKey: 'validate.email_invalid',
    required: true,
    readonly: true,
    inputType: 'email',
  },
  {
    name: 'phone',
    labelKey: 'profile.label_phone',
    placeholderKey: 'profile.placeholder_phone',
    format: formatPhoneNL,
    required: true,
    inputType: 'tel',
  },
  {
    name: 'street',
    labelKey: 'profile.label_address',
    placeholderKey: 'profile.placeholder_street',
    required: true,
  },
  {
    name: 'house_number',
    labelKey: 'profile.label_house_number',
    placeholderKey: 'profile.placeholder_house_number',
    required: true,
  },
  {
    name: 'postcode',
    labelKey: 'profile.label_postcode',
    placeholderKey: 'profile.placeholder_postcode',
    validate: isValidPostcodeNL,
    validationErrorKey: 'validate.postcode_invalid',
    required: true,
  },
  {
    name: 'city',
    labelKey: 'profile.label_city',
    placeholderKey: 'profile.placeholder_city',
    required: true,
  },
  {
    name: 'country',
    labelKey: 'profile.label_country',
    placeholderKey: 'profile.placeholder_country',
    required: true,
  },
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
    placeholderKey: 'profile.placeholder_bsn',
    format: formatBSNMasked,
    validate: isValidBSN,
    validationErrorKey: 'validate.bsn_invalid',
    required: true,
  },
  {
    name: 'bank_account',
    labelKey: 'profile.label_iban',
    placeholderKey: 'profile.placeholder_iban',
    format: formatIBAN,
    validate: isValidIBAN,
    validationErrorKey: 'validate.iban_invalid',
    required: true,
  },
  {
    name: 'bic',
    labelKey: 'profile.label_bic',
    placeholderKey: 'profile.placeholder_bic',
    required: true,
  },
];

/**
 * In-memory draft-cache voor onboarding-velden. Per-auteur gekeyd.
 * Overleeft tab-switch en partiele herrenders binnen dezelfde sessie.
 * Bewust geen localStorage: BSN en IBAN mogen niet permanent op disk
 * (AVG-risico). Bij browser-refresh accepteren we dataverlies.
 */
const draftCache = new Map<string, Map<keyof AuthorRow, string>>();

function getDraft(authorId: string): Map<keyof AuthorRow, string> {
  let m = draftCache.get(authorId);
  if (m === undefined) {
    m = new Map();
    draftCache.set(authorId, m);
  }
  return m;
}

function clearDraft(authorId: string): void {
  draftCache.delete(authorId);
}

export function renderProfileTab(container: HTMLElement, author: AuthorRow): void {
  container.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = t('profile.title');
  container.appendChild(heading);

  // Vendor en Alliant ID zijn admin-velden (NetSuite-koppeling). Auteur
  // ziet ze pas wanneer zijn account daadwerkelijk actief is.
  if (author.onboarding_status === 'active') {
    const banner = document.createElement('div');
    banner.className = 'id-banner';
    banner.appendChild(idChip('profile.id_vendor', author.netsuite_vendor_id));
    banner.appendChild(idChip('profile.id_alliant', author.alliant_id));
    container.appendChild(banner);
  }

  if (author.onboarding_status === 'pending_data') {
    void renderOnboardingMode(container, author);
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
// Mode: pending_data — onboarding-form, schrijft naar change_requests
// (admin reviewt per veld onder Persoonsgegevens-tab vóór toepassing op
// authors).
// =============================================================================
async function renderOnboardingMode(container: HTMLElement, author: AuthorRow): Promise<void> {
  // Pre-load pending change-requests zodat we de "in-afwachting" waarden
  // tonen — anders zou de auteur denken dat zijn eerder ingevulde data
  // verdwenen is (terwijl die wacht op admin-goedkeuring).
  const pendingByField = await loadPendingChangeRequests(author.id);

  const form = document.createElement('form');
  form.className = 'profile-onboarding-form';
  form.noValidate = true;

  const status = document.createElement('div');
  status.className = 'admin-status';
  status.hidden = true;
  form.appendChild(status);

  const inputs = new Map<keyof AuthorRow, HTMLInputElement>();
  const errors = new Map<keyof AuthorRow, HTMLElement>();

  // Werkbare snapshot — wijzigt bij elke save zodat activeer-validatie klopt
  const workingAuthor: AuthorRow = { ...author };
  const draft = getDraft(author.id);

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
    if (field.placeholderKey !== undefined) {
      input.placeholder = t(field.placeholderKey);
    }
    // Initialisatie-volgorde: draft > pending change_request > authors-DB.
    //   - draft = recent getypt maar nog niet opgeslagen (overleeft tab-switch)
    //   - pending = wel opgeslagen, wacht op admin-goedkeuring
    //   - authors = goedgekeurde of bestaande waarde
    const stored = draft.get(field.name);
    const pending = pendingByField.get(field.name);
    const raw = author[field.name];
    const rawStr = typeof raw === 'string' ? raw : raw === null ? '' : String(raw);
    input.value = stored ?? pending ?? rawStr;
    if (field.readonly === true) {
      input.readOnly = true;
      input.classList.add('auth-field-readonly');
    }
    wrap.appendChild(input);

    const err = document.createElement('small');
    err.className = 'auth-field-error';
    err.hidden = true;
    wrap.appendChild(err);

    input.addEventListener('blur', () => {
      validateField(field, input, err);
    });
    input.addEventListener('input', () => {
      draft.set(field.name, input.value);
      // Clearen zodra waarde weer valide is — minder visuele ruis dan rood
      // laten staan tot blur. Pas validateren als de fout al zichtbaar was,
      // anders gaat de hint pas pop-up als de gebruiker echt foutief getypt
      // heeft (voorkomt verstoring tijdens eerste invoer).
      if (!err.hidden) {
        validateField(field, input, err);
      }
      updateActivateButtonState();
    });

    inputs.set(field.name, input);
    errors.set(field.name, err);
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
  missingHint.setAttribute('aria-live', 'polite');
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

  function gatherProblems(): { missing: string[]; invalid: string[] } {
    const values = gatherInputValues();
    const missing: string[] = [];
    const invalid: string[] = [];
    for (const field of FIELDS) {
      if (!field.required) {
        continue;
      }
      const val = values.get(field.name) ?? '';
      if (val === '') {
        missing.push(t(field.labelKey));
        continue;
      }
      if (field.validate !== undefined && !field.validate(val)) {
        invalid.push(t(field.labelKey));
      }
    }
    return { missing, invalid };
  }

  function updateActivateButtonState(): void {
    const { missing, invalid } = gatherProblems();
    const total = missing.length + invalid.length;
    if (total === 0) {
      activateBtn.removeAttribute('aria-disabled');
      activateBtn.classList.remove('auth-submit-blocked');
      missingHint.textContent = '';
      return;
    }
    // Knop blijft clickbaar maar visueel disabled; click triggert
    // validateAll + scroll naar eerste fout zodat de gebruiker weet
    // waarom hij niet door kan.
    activateBtn.setAttribute('aria-disabled', 'true');
    activateBtn.classList.add('auth-submit-blocked');
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(t('onboarding.hint_missing').replace('{fields}', missing.join(', ')));
    }
    if (invalid.length > 0) {
      parts.push(t('onboarding.hint_invalid').replace('{fields}', invalid.join(', ')));
    }
    missingHint.textContent = parts.join(' ');
  }

  function validateAllAndScroll(): void {
    for (const [name, input] of inputs) {
      const field = FIELDS.find((f) => f.name === name);
      const err = errors.get(name);
      if (field !== undefined && err !== undefined) {
        validateField(field, input, err);
      }
    }
    const firstBad = form.querySelector<HTMLInputElement>('.auth-field-input-invalid');
    if (firstBad !== null) {
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstBad.focus();
    }
  }

  saveBtn.addEventListener('click', () => {
    void saveOnboardingData(workingAuthor, inputs, status, saveBtn, false);
  });

  activateBtn.addEventListener('click', () => {
    const { missing, invalid } = gatherProblems();
    if (missing.length + invalid.length > 0) {
      validateAllAndScroll();
      return;
    }
    void saveOnboardingData(workingAuthor, inputs, status, activateBtn, true).then((ok) => {
      if (ok) {
        void requestActivation(workingAuthor, status, activateBtn);
      }
      return undefined;
    });
  });

  updateActivateButtonState();
}

function validateField(field: FieldDef, input: HTMLInputElement, err: HTMLElement): void {
  const val = input.value.trim();
  let msg: string | null = null;
  if (field.required && val === '') {
    msg = t('onboarding.field_required');
  } else if (field.validate !== undefined && val !== '' && !field.validate(val)) {
    msg =
      field.validationErrorKey !== undefined
        ? t(field.validationErrorKey)
        : t('onboarding.field_invalid');
  }
  if (msg !== null) {
    err.textContent = msg;
    err.hidden = false;
    input.classList.add('auth-field-input-invalid');
    input.setAttribute('aria-invalid', 'true');
  } else {
    err.hidden = true;
    err.textContent = '';
    input.classList.remove('auth-field-input-invalid');
    input.removeAttribute('aria-invalid');
  }
}

async function saveOnboardingData(
  author: AuthorRow,
  inputs: Map<keyof AuthorRow, HTMLInputElement>,
  status: HTMLElement,
  submit: HTMLButtonElement,
  silentOnSuccess: boolean
): Promise<boolean> {
  // Haal bestaande pending change_requests op — als auteur eerder al een
  // veld heeft ingevuld dat nog niet door admin is verwerkt, willen we de
  // bestaande rij UPDATE-en ipv een tweede pending-rij naast te zetten.
  const { data: existing, error: existErr } = await supabase
    .from('change_requests')
    .select('id, field_name')
    .eq('author_id', author.id)
    .eq('status', 'pending');
  if (existErr !== null) {
    reportError('profile.onboardingSave.loadPending', existErr);
    showStatus(status, 'error', `Opslaan faalde: ${existErr.message}`);
    return false;
  }
  const existingIdByField = new Map<string, string>();
  existing.forEach((r) => existingIdByField.set(r.field_name, r.id));

  // Verzamel wijzigingen — diff tegen authors-DB-waarde EN tegen huidige
  // pending-waarde, zodat een tweede save met dezelfde waarde geen
  // overbodige UPDATE doet.
  const toInsert: {
    author_id: string;
    field_name: string;
    old_value: string | null;
    new_value: string;
    status: 'pending';
  }[] = [];
  const toUpdate: { id: string; new_value: string }[] = [];

  for (const field of FIELDS) {
    if (field.readonly === true) {
      continue;
    }
    const input = inputs.get(field.name);
    if (input === undefined) {
      continue;
    }
    const newVal = input.value.trim();
    if (newVal === '') {
      // Lege invoer wordt niet als change_request opgeslagen; auteur kan
      // later alsnog invullen. Bestaande pending blijft staan tot admin
      // 'm afwijst.
      continue;
    }
    const raw = author[field.name];
    const dbVal = typeof raw === 'string' ? raw : raw === null ? '' : String(raw);

    if (field.validate !== undefined && !field.validate(newVal)) {
      const errMsg =
        field.validationErrorKey !== undefined
          ? t(field.validationErrorKey)
          : t('onboarding.field_invalid');
      showStatus(status, 'error', errMsg);
      return false;
    }

    const existingId = existingIdByField.get(field.name);
    if (existingId !== undefined) {
      // Pending bestaat al — overschrijf alleen als waarde verandert
      toUpdate.push({ id: existingId, new_value: newVal });
    } else if (newVal !== dbVal) {
      // Nieuwe wijziging tegenover authors-DB
      toInsert.push({
        author_id: author.id,
        field_name: field.name,
        old_value: dbVal === '' ? null : dbVal,
        new_value: newVal,
        status: 'pending',
      });
    }
  }

  if (toInsert.length === 0 && toUpdate.length === 0) {
    if (!silentOnSuccess) {
      showStatus(status, 'success', t('profile.changes_nothing'));
    }
    return true;
  }

  submit.disabled = true;

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('change_requests').insert(toInsert);
    if (insErr !== null) {
      submit.disabled = false;
      reportError('profile.onboardingSave.insert', insErr);
      showStatus(status, 'error', `Opslaan faalde: ${insErr.message}`);
      return false;
    }
  }
  for (const u of toUpdate) {
    const { error: updErr } = await supabase
      .from('change_requests')
      .update({ new_value: u.new_value })
      .eq('id', u.id);
    if (updErr !== null) {
      submit.disabled = false;
      reportError('profile.onboardingSave.update', updErr);
      showStatus(status, 'error', `Opslaan faalde: ${updErr.message}`);
      return false;
    }
  }

  submit.disabled = false;

  // Draft is nu naar change_requests gesynct; cache wissen.
  clearDraft(author.id);

  if (!silentOnSuccess) {
    showStatus(status, 'success', t('profile.changes_submitted_for_review'));
  }
  return true;
}

/**
 * Laad alle pending change-requests voor deze auteur in een Map
 * `field_name → new_value`. Wordt gebruikt om de onboarding-form te
 * initialiseren met "in afwachting"-waarden zodat de auteur niet denkt
 * dat zijn eerder ingevulde data verloren is.
 */
async function loadPendingChangeRequests(authorId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('change_requests')
    .select('field_name, new_value')
    .eq('author_id', authorId)
    .eq('status', 'pending');
  if (error !== null) {
    reportError('profile.loadPending', error);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const r of data) {
    if (r.new_value !== null) {
      out.set(r.field_name, r.new_value);
    }
  }
  return out;
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

  clearDraft(author.id);
  // Toon centrale bevestigings-modal; pas op bewust sluiten herladen we
  // de pagina zodat decideAccess opnieuw evalueert + onboarding-banner
  // omschakelt naar de pending_admin_review-variant.
  showActivationSuccessModal(() => {
    window.location.reload();
  });
}

const ICON_CHECK_CIRCLE =
  '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>';

function showActivationSuccessModal(onClose: () => void): void {
  if (document.querySelector('.modal-overlay.activate-success-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay activate-success-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal activate-success-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', t('common.close'));
  modal.appendChild(closeBtn);

  const iconWrap = document.createElement('div');
  iconWrap.className = 'activate-success-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  // Statische SVG-string uit eigen module
  // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
  iconWrap.innerHTML = ICON_CHECK_CIRCLE;
  modal.appendChild(iconWrap);

  const heading = document.createElement('h3');
  heading.className = 'activate-success-heading';
  heading.textContent = t('onboarding.activate_success_heading');
  modal.appendChild(heading);

  const body = document.createElement('p');
  body.className = 'activate-success-body';
  body.textContent = t('onboarding.activate_confirmation');
  modal.appendChild(body);

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'auth-submit';
  continueBtn.textContent = t('common.close');
  modal.appendChild(continueBtn);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    onClose();
  };

  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    }
  };

  closeBtn.addEventListener('click', close);
  continueBtn.addEventListener('click', close);
  // Bewust GEEN overlay-click-to-close: dit is een belangrijke bevestiging
  // die de auteur actief moet sluiten zodat de page-reload gestart wordt.
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(overlay);
  setTimeout(() => {
    continueBtn.focus();
  }, 50);
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

function idChip(labelKey: TranslationKey, value: string | null): HTMLElement {
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
      const errMsg =
        field.validationErrorKey !== undefined
          ? t(field.validationErrorKey)
          : t('onboarding.field_invalid');
      showStatus(status, 'error', errMsg);
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
