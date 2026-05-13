/**
 * Admin-pagina.
 *
 * Statussen (volgorde-ladder, eerste match wint):
 *   1. Persoonsgegevens nog toe te voegen — naam/adres/IBAN/BIC ontbreekt
 *   2. Statements nog toe te voegen        — geen enkele `payments`-rij
 *   3. Gereed voor activatie               — data + statements klaar, niet active
 *   4. Actief                              — `onboarding_status='active'`
 *
 * Auteurs gesorteerd op `created_at` DESC (nieuwste boven). Cards tonen
 * status-pill prominent rechts; actieknop hangt af van de status. Geen
 * 2FA-/wachtwoord-flags meer in de meta-tekst (alleen waar relevant via
 * een aparte indicator).
 *
 * @module views/admin
 */

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import { renderChangesSection } from './admin/changes';
import { openCsvExportModal } from './admin/csv-export';
import { openExcelImportModal } from './admin/excel-import';
import { openBulkStatementUploadModal } from './admin/bulk-statement-upload';
import { extractFnError, formatFnErrorMessage } from '@/lib/edge-function-errors';
import { buildAppHeader } from './shared/header';

/** Vier statussen die de admin in de UI ziet. */
type AdminStatus = 'persoonsgegevens' | 'statements' | 'gereed' | 'actief';

type FilterValue = 'all' | AdminStatus;

interface ListState {
  filter: FilterValue;
  authors: AuthorRow[];
  /** Set van author-IDs die ten minste één `payments`-rij hebben. */
  paymentsByAuthor: Set<string>;
}

export function renderAdminView(root: HTMLElement, admin: AuthorRow): void {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'app-shell';
  layout.appendChild(buildAppHeader());

  const main = document.createElement('main');
  main.className = 'admin-content';
  layout.appendChild(main);

  // -- Pending change_requests bovenaan
  const changesWrapper = document.createElement('section');
  changesWrapper.className = 'admin-section';
  main.appendChild(changesWrapper);
  const refreshChanges = (): void => {
    changesWrapper.replaceChildren();
    void renderChangesSection(changesWrapper, admin.id, refreshChanges);
  };
  refreshChanges();

  // -- Auteursbeheer-sectie
  const sectionHeader = document.createElement('header');
  sectionHeader.className = 'admin-section-header';

  const overline = document.createElement('span');
  overline.className = 'admin-section-overline';
  overline.textContent = t('admin.section_overline');
  sectionHeader.appendChild(overline);

  const heading = document.createElement('h2');
  heading.className = 'admin-section-heading';
  heading.textContent = t('admin.section_heading');
  sectionHeader.appendChild(heading);

  main.appendChild(sectionHeader);

  const statusBox = document.createElement('div');
  statusBox.className = 'admin-status';
  statusBox.hidden = true;
  main.appendChild(statusBox);

  // Toolbar: actie-knoppen
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  main.appendChild(toolbar);

  const excelBtn = buildToolbarBtn(
    t('admin.toolbar_excel_import'),
    ICON_DOWNLOAD,
    t('admin.tooltip_excel_import')
  );
  toolbar.appendChild(excelBtn);

  const bulkStmtBtn = buildToolbarBtn(
    t('admin.toolbar_bulk_statements'),
    ICON_UPLOAD,
    t('admin.tooltip_bulk_statements')
  );
  toolbar.appendChild(bulkStmtBtn);

  const exportBtn = buildToolbarBtn(
    t('admin.toolbar_csv_export'),
    ICON_UPLOAD,
    t('admin.tooltip_csv_export')
  );
  toolbar.appendChild(exportBtn);

  const newAuthorBtn = buildToolbarBtn(
    t('admin.toolbar_new_author'),
    ICON_PLUS,
    t('admin.tooltip_new_author')
  );
  toolbar.appendChild(newAuthorBtn);

  // Filter-tabs
  const filters = document.createElement('div');
  filters.className = 'admin-filters';
  main.appendChild(filters);

  const list = document.createElement('div');
  list.className = 'admin-author-list';
  list.textContent = t('common.loading');
  main.appendChild(list);

  const state: ListState = { filter: 'all', authors: [], paymentsByAuthor: new Set() };

  function rerender(): void {
    renderFilterButtons(filters, state, () => {
      rerender();
    });
    renderList(list, state, statusBox);
  }

  excelBtn.addEventListener('click', () => {
    openExcelImportModal(() => {
      void loadAuthors(state, rerender, statusBox);
    });
  });

  bulkStmtBtn.addEventListener('click', () => {
    openBulkStatementUploadModal(() => {
      void loadAuthors(state, rerender, statusBox);
    });
  });

  exportBtn.addEventListener('click', () => {
    openCsvExportModal(state.authors, () => {
      void loadAuthors(state, rerender, statusBox);
    });
  });

  newAuthorBtn.addEventListener('click', () => {
    openNewAuthorForm(
      main,
      () => {
        void loadAuthors(state, rerender, statusBox);
      },
      statusBox
    );
  });

  void loadAuthors(state, rerender, statusBox);
  root.appendChild(layout);
}

async function loadAuthors(
  state: ListState,
  onLoaded: () => void,
  statusBox: HTMLElement
): Promise<void> {
  // Twee queries: authors (nieuwste eerst) + alle payment-author_ids zodat we
  // de status "Statements nog toe te voegen" client-side kunnen afleiden
  // zonder per-rij round-trip. Volume in test-fase laag genoeg om alles op
  // te halen; voor schaalbaarheid later vervangen door een aggregate-RPC.
  const [authorsResp, paymentsResp] = await Promise.all([
    supabase.from('authors').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('author_id'),
  ]);

  if (authorsResp.error !== null) {
    reportError('admin.loadAuthors', authorsResp.error);
    showStatus(statusBox, 'error', `Auteurs laden faalde: ${authorsResp.error.message}`);
    state.authors = [];
    onLoaded();
    return;
  }

  const paymentsByAuthor = new Set<string>();
  if (paymentsResp.error === null) {
    for (const row of paymentsResp.data) {
      paymentsByAuthor.add(row.author_id);
    }
  } else {
    reportError('admin.loadPayments', paymentsResp.error);
    // Niet-fataal: zonder payment-info zal alles als "Statements nog toe te
    // voegen" weergegeven worden. Admin-functionaliteit blijft werken.
  }

  state.authors = authorsResp.data;
  state.paymentsByAuthor = paymentsByAuthor;
  onLoaded();
}

// =============================================================================
// Status-derivatie
// =============================================================================
/**
 * Bepaalt de UI-status voor één auteur volgens de prioriteits-ladder:
 *   1. `actief` als onboarding_status = 'active' (admin heeft expliciet
 *      geactiveerd; vanaf hier is verder check niet meer relevant).
 *   2. `persoonsgegevens` als naam/adres/IBAN/BIC ontbreekt.
 *   3. `statements` als er nog geen enkele payment-rij is.
 *   4. `gereed` — alles compleet, wacht op admin-activatie.
 *
 * Admins krijgen `actief` (los van checks) zodat ze niet in een verkeerde
 * filter belanden.
 */
export function deriveAdminStatus(author: AuthorRow, hasPayments: boolean): AdminStatus {
  if (author.is_admin || author.onboarding_status === 'active') {
    return 'actief';
  }
  if (!hasCompletePersonData(author)) {
    return 'persoonsgegevens';
  }
  if (!hasPayments) {
    return 'statements';
  }
  return 'gereed';
}

function hasCompletePersonData(a: AuthorRow): boolean {
  const filled = (v: string | null): boolean => v !== null && v.trim().length > 0;
  return (
    filled(a.first_name) &&
    filled(a.last_name) &&
    filled(a.street) &&
    filled(a.house_number) &&
    filled(a.postcode) &&
    filled(a.city) &&
    filled(a.bank_account) &&
    filled(a.bic)
  );
}

// =============================================================================
// Filter-buttons
// =============================================================================
function renderFilterButtons(container: HTMLElement, state: ListState, onChange: () => void): void {
  container.replaceChildren();

  const counts = countByDerivedStatus(state);
  const items: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: t('admin.filter_all'), count: state.authors.length },
    {
      value: 'persoonsgegevens',
      label: t('admin.status_persoonsgegevens_short'),
      count: counts.persoonsgegevens,
    },
    {
      value: 'statements',
      label: t('admin.status_statements_short'),
      count: counts.statements,
    },
    {
      value: 'gereed',
      label: t('admin.status_gereed_short'),
      count: counts.gereed,
    },
    { value: 'actief', label: t('admin.status_actief_short'), count: counts.actief },
  ];

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-filter-btn';
    if (state.filter === item.value) {
      btn.classList.add('active');
    }
    btn.textContent = `${item.label} (${String(item.count)})`;
    btn.addEventListener('click', () => {
      state.filter = item.value;
      onChange();
    });
    container.appendChild(btn);
  }
}

function countByDerivedStatus(state: ListState): Record<AdminStatus, number> {
  const counts: Record<AdminStatus, number> = {
    persoonsgegevens: 0,
    statements: 0,
    gereed: 0,
    actief: 0,
  };
  for (const a of state.authors) {
    const status = deriveAdminStatus(a, state.paymentsByAuthor.has(a.id));
    counts[status]++;
  }
  return counts;
}

// =============================================================================
// Lijst + cards
// =============================================================================
function renderList(container: HTMLElement, state: ListState, statusBox: HTMLElement): void {
  container.replaceChildren();

  const filtered = state.authors.filter((a) => {
    if (state.filter === 'all') {
      return true;
    }
    return deriveAdminStatus(a, state.paymentsByAuthor.has(a.id)) === state.filter;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = t('admin.empty_filter');
    container.appendChild(empty);
    return;
  }

  for (const author of filtered) {
    const onChanged = (): void => {
      refreshOne(state, author.id, container, statusBox);
    };
    container.appendChild(renderAuthorCard(author, state, onChanged, statusBox));
  }
}

/** Vervang één auteur-rij in state na een actie, daarna re-render de lijst. */
function refreshOne(
  state: ListState,
  authorId: string,
  container: HTMLElement,
  statusBox: HTMLElement
): void {
  void supabase
    .from('authors')
    .select('*')
    .eq('id', authorId)
    .maybeSingle()
    .then((r) => {
      if (r.data !== null) {
        const idx = state.authors.findIndex((a) => a.id === authorId);
        if (idx >= 0) {
          state.authors[idx] = r.data;
        }
      }
      // Ook payments opnieuw ophalen — bv. na een activatie of een upload
      return supabase.from('payments').select('author_id');
    })
    .then((pResp) => {
      if (pResp.error === null) {
        const set = new Set<string>();
        for (const row of pResp.data) {
          set.add(row.author_id);
        }
        state.paymentsByAuthor = set;
      }
      renderList(container, state, statusBox);
    });
}

function renderAuthorCard(
  author: AuthorRow,
  state: ListState,
  onChanged: () => void,
  statusBox: HTMLElement
): HTMLElement {
  const hasPayments = state.paymentsByAuthor.has(author.id);
  const status = deriveAdminStatus(author, hasPayments);

  const card = document.createElement('div');
  card.className = `admin-author-card admin-author-card--${status}`;

  // -- Hoofd-info-kolom (naam + meta)
  const main = document.createElement('div');
  main.className = 'admin-author-main';

  const name = document.createElement('div');
  name.className = 'admin-author-name';
  name.textContent = `${author.first_name} ${author.last_name}`;
  main.appendChild(name);

  const email = document.createElement('div');
  email.className = 'admin-author-email';
  email.textContent = author.email;
  main.appendChild(email);

  const meta = document.createElement('div');
  meta.className = 'admin-author-meta';
  const parts: string[] = [
    t('admin.created_at').replace('{date}', formatShortDate(author.created_at)),
  ];
  if (author.netsuite_vendor_id !== null) {
    parts.push(`Vendor ${author.netsuite_vendor_id}`);
  }
  if (author.activated_at !== null) {
    parts.push(t('admin.activated_at').replace('{date}', formatShortDate(author.activated_at)));
  } else if (author.reminder_sent_at !== null) {
    parts.push(t('admin.reminder_at').replace('{date}', formatShortDate(author.reminder_sent_at)));
  } else if (author.invited_at !== null) {
    parts.push(t('admin.invited_at').replace('{date}', formatShortDate(author.invited_at)));
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  card.appendChild(main);

  // -- Rechter-kolom: status-pill + actie
  const right = document.createElement('div');
  right.className = 'admin-author-right';

  right.appendChild(buildStatusPill(author, status));

  const actions = document.createElement('div');
  actions.className = 'admin-author-actions';

  // Per-status actie-knop
  if (!author.is_admin) {
    if (status === 'persoonsgegevens') {
      actions.appendChild(
        buildActionBtn(
          t('admin.btn_send_reminder_label'),
          () => {
            void invokeCreateAccounts(author, 'invite', statusBox).then(onChanged);
          },
          t('admin.tooltip_send_reminder')
        )
      );
    } else if (status === 'gereed') {
      actions.appendChild(
        buildActionBtn(
          t('admin.btn_activate'),
          () => {
            void invokeCreateAccounts(author, 'activate', statusBox).then(onChanged);
          },
          t('admin.tooltip_activate')
        )
      );
    }
  }

  // Reset-2FA-knop blijft beschikbaar voor accounts met verified factor.
  if (author.mfa_enrolled) {
    actions.appendChild(
      buildActionBtn(
        t('admin.btn_reset_mfa'),
        () => {
          void resetMfaForAuthor(author, statusBox).then(onChanged);
        },
        t('admin.tooltip_reset_mfa')
      )
    );
  }

  right.appendChild(actions);
  card.appendChild(right);

  return card;
}

/** Status-pill rechtsboven in de card. Kleur via modifier-class in CSS. */
function buildStatusPill(author: AuthorRow, status: AdminStatus): HTMLElement {
  const pill = document.createElement('span');
  pill.className = `admin-status-pill admin-status-pill--${status}`;

  // Admin-rol expliciet labelen (los van de auteur-statussen).
  if (author.is_admin) {
    pill.classList.add('admin-status-pill--admin');
    pill.textContent = t('admin.status_admin');
    return pill;
  }

  switch (status) {
    case 'persoonsgegevens':
      pill.textContent = t('admin.status_persoonsgegevens');
      break;
    case 'statements':
      pill.textContent = t('admin.status_statements');
      break;
    case 'gereed':
      pill.textContent = t('admin.status_gereed');
      break;
    case 'actief':
      pill.textContent = t('admin.status_actief');
      break;
  }
  return pill;
}

async function resetMfaForAuthor(author: AuthorRow, statusBox: HTMLElement): Promise<void> {
  const confirmMsg = t('admin.confirm_reset_mfa').replace(
    '{name}',
    `${author.first_name} ${author.last_name}`
  );
  // Native confirm — admin-tool, accessibility is acceptabel + voorkomt
  // dat we hier een eigen modal-component moeten introduceren.
  // eslint-disable-next-line no-alert
  if (!window.confirm(confirmMsg)) {
    return;
  }

  const { data, error } = await supabase.rpc('admin_reset_mfa', { p_author_id: author.id });
  if (error !== null) {
    reportError('admin.resetMfa', error);
    showStatus(statusBox, 'error', `${t('admin.reset_mfa_failed')}: ${error.message}`);
    return;
  }
  const deleted = typeof data === 'number' ? data : 0;
  showStatus(
    statusBox,
    'success',
    t('admin.reset_mfa_success')
      .replace('{name}', `${author.first_name} ${author.last_name}`)
      .replace('{count}', String(deleted))
  );
}

function buildActionBtn(label: string, onClick: () => void, tooltip?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-activate';
  btn.textContent = label;
  if (tooltip !== undefined) {
    btn.title = tooltip;
    btn.setAttribute('aria-label', `${label} — ${tooltip}`);
  }
  btn.addEventListener('click', onClick);
  return btn;
}

// =============================================================================
// Edge Function call
// =============================================================================
interface CreateAccountsResult {
  results?: {
    author_id?: string;
    email?: string;
    status: 'invited' | 'activated' | 'reminder_sent' | 'already_active' | 'failed';
    error?: string;
  }[];
}

async function invokeCreateAccounts(
  author: AuthorRow,
  mode: 'invite' | 'activate',
  statusBox: HTMLElement
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session === null) {
    showStatus(statusBox, 'error', 'Geen actieve sessie.');
    return;
  }

  const result = await supabase.functions.invoke<CreateAccountsResult>('create-accounts', {
    body: { author_id: author.id, email: author.email, mode },
  });

  const fnError = await extractFnError(result.error);
  if (fnError !== null) {
    reportError('admin.invokeCreateAccounts', new Error(fnError.message));
    showStatus(statusBox, 'error', `Actie faalde: ${formatFnErrorMessage(fnError)}`);
    return;
  }

  // Parse de results-array — Edge Function kan HTTP 200 returnen met per-row failures
  const firstResult = result.data?.results?.[0];
  if (firstResult === undefined) {
    showStatus(statusBox, 'error', 'Onverwacht antwoord van Edge Function (geen results).');
    return;
  }

  if (firstResult.status === 'failed') {
    reportError('admin.invokeCreateAccounts', new Error(firstResult.error ?? 'unknown'));
    showStatus(
      statusBox,
      'error',
      `Actie faalde: ${firstResult.error ?? 'onbekende fout in Edge Function'}`
    );
    return;
  }

  const verb =
    mode === 'invite' && author.invited_at !== null
      ? 'Reminder verstuurd'
      : mode === 'invite'
        ? 'Uitnodiging verstuurd'
        : 'Geactiveerd';
  showStatus(statusBox, 'success', `${verb}: ${author.email}`);
}

// =============================================================================
// Nieuwe-auteur form
// =============================================================================
interface NewAuthorValues {
  email: string;
  first_name: string;
  last_name: string;
  netsuite_vendor_id: string | null;
}

function openNewAuthorForm(
  parent: HTMLElement,
  onCreated: () => void,
  statusBox: HTMLElement
): void {
  const existing = parent.querySelector('.admin-new-author-form');
  if (existing !== null) {
    existing.remove();
    return;
  }

  const form = document.createElement('form');
  form.className = 'admin-new-author-form';

  const heading = document.createElement('h3');
  heading.textContent = t('admin.new_author_heading');
  form.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'profile-edit-intro';
  intro.textContent = t('admin.new_author_intro');
  form.appendChild(intro);

  const emailField = labeledInput('email', t('admin.new_author_field_email'), 'email', true);
  const firstNameField = labeledInput(
    'first_name',
    t('admin.new_author_field_firstname'),
    'text',
    true
  );
  const lastNameField = labeledInput(
    'last_name',
    t('admin.new_author_field_lastname'),
    'text',
    true
  );
  const vendorField = labeledInput(
    'netsuite_vendor_id',
    t('admin.new_author_field_vendor'),
    'text',
    false
  );

  form.appendChild(emailField.field);
  form.appendChild(firstNameField.field);
  form.appendChild(lastNameField.field);
  form.appendChild(vendorField.field);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = t('admin.new_author_submit');
  form.appendChild(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const vendorRaw = vendorField.input.value.trim();
    const values: NewAuthorValues = {
      email: emailField.input.value.trim(),
      first_name: firstNameField.input.value.trim(),
      last_name: lastNameField.input.value.trim(),
      netsuite_vendor_id: vendorRaw.length > 0 ? vendorRaw : null,
    };
    void createAndInviteAuthor(values, form, submit, statusBox, onCreated);
  });

  parent.appendChild(form);
}

async function createAndInviteAuthor(
  values: NewAuthorValues,
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  statusBox: HTMLElement,
  onCreated: () => void
): Promise<void> {
  submit.disabled = true;
  submit.textContent = t('common.busy');

  // Insert (status default = pending_data). `must_change_password=true` zorgt
  // dat de auteur bij eerste inlog gedwongen wordt het start-wachtwoord
  // 'Noordhoff' te wijzigen — symmetrisch met de bulk-import-flow.
  const { data, error } = await supabase
    .from('authors')
    .insert({
      ...values,
      is_admin: false,
      must_change_password: true,
    })
    .select('id, email')
    .single();

  if (error !== null) {
    submit.disabled = false;
    submit.textContent = t('admin.new_author_submit');
    reportError('admin.createAuthor', error);
    showStatus(statusBox, 'error', `Aanmaken faalde: ${error.message}`);
    return;
  }

  // Direct invite-mail triggeren
  const insertedId: string = data.id;
  const insertedEmail: string = data.email;

  // Tijdens test-fase: maak auth-user direct aan met wachtwoord 'Noordhoff'
  // (zelfde patroon als bulk-import). Mail-flow is uit; admin geeft het
  // wachtwoord persoonlijk door. Bij eerste inlog wordt het verplicht
  // gewijzigd dankzij must_change_password.
  const inviteResult = await supabase.functions.invoke<CreateAccountsResult>('create-accounts', {
    body: {
      author_id: insertedId,
      email: insertedEmail,
      password: INITIAL_PASSWORD,
      mode: 'invite',
    },
  });

  const fnErr = await extractFnError(inviteResult.error);
  const firstResult = inviteResult.data?.results?.[0];
  const failed = fnErr !== null || firstResult === undefined || firstResult.status === 'failed';

  if (failed) {
    submit.disabled = false;
    submit.textContent = t('admin.new_author_submit');
    const reason =
      fnErr !== null ? formatFnErrorMessage(fnErr) : (firstResult?.error ?? 'onbekend');
    showStatus(statusBox, 'error', `Auteur aangemaakt maar account-creatie faalde (${reason}).`);
    onCreated();
    return;
  }

  form.remove();
  showStatus(
    statusBox,
    'success',
    `${values.email} aangemaakt. Geef de auteur persoonlijk het wachtwoord "${INITIAL_PASSWORD}" door — bij eerste inlog wordt deze automatisch gewijzigd.`
  );
  onCreated();
}

/** Vast start-wachtwoord voor de test-fase. Zie 0015_must_change_password.sql. */
const INITIAL_PASSWORD = 'Noordhoff';

// =============================================================================
// Helpers
// =============================================================================
function labeledInput(
  name: string,
  label: string,
  type: 'text' | 'email',
  required: boolean
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  if (required) {
    input.required = true;
  }
  field.appendChild(input);

  return { field, input };
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}

// =============================================================================
// Inline SVG-icons — uniform 16×16, stroke 1.5, monochrome currentColor
// =============================================================================
const ICON_DOWNLOAD =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

const ICON_UPLOAD =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

const ICON_PLUS =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

function buildToolbarBtn(label: string, iconSvg: string, tooltip?: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-action';
  if (tooltip !== undefined) {
    btn.title = tooltip;
    btn.setAttribute('aria-label', `${label} — ${tooltip}`);
  }

  const iconWrap = document.createElement('span');
  iconWrap.className = 'admin-action-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  // SVG-strings uit eigen module — niet gebruiker-gegenereerd
  // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
  iconWrap.innerHTML = iconSvg;
  btn.appendChild(iconWrap);

  const labelEl = document.createElement('span');
  labelEl.className = 'admin-action-label';
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  return btn;
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear())}`;
}
