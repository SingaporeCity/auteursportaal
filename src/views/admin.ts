/**
 * Admin-pagina (uitgebreid in iter 4):
 *  - Pending wijzigingsverzoeken (alle auteurs)
 *  - Toolbar: filter (alle / wacht-review / wacht-auteur) + acties (CSV-import, nieuwe auteur)
 *  - Auteurslijst met:
 *      - Status-badge per auteur (geel pending_data / oranje pending_admin_review / groen active)
 *      - Per status passende actie-knop (Stuur uitnodiging / Activeer / Stuur reminder)
 *      - Inline statement-upload voor active auteurs
 *
 * @module views/admin
 */

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import { renderChangesSection } from './admin/changes';
import { buildStatementUploadForm } from './admin/statement-upload';
import { openCsvImportModal } from './admin/csv-import';
import { openCsvExportModal } from './admin/csv-export';
import { openExcelImportModal } from './admin/excel-import';
import { buildAppHeader } from './shared/header';
import type { OnboardingStatus } from '@/types/db';

type FilterValue = 'all' | 'pending_admin_review' | 'pending_data' | 'active';

interface ListState {
  filter: FilterValue;
  authors: AuthorRow[];
}

const REMINDER_THRESHOLD_DAYS = 14;

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

  const csvBtn = buildToolbarBtn(t('admin.toolbar_csv_import'), ICON_DOWNLOAD);
  toolbar.appendChild(csvBtn);

  const excelBtn = buildToolbarBtn(t('admin.toolbar_excel_import'), ICON_DOWNLOAD);
  toolbar.appendChild(excelBtn);

  const exportBtn = buildToolbarBtn(t('admin.toolbar_csv_export'), ICON_UPLOAD);
  toolbar.appendChild(exportBtn);

  const newAuthorBtn = buildToolbarBtn(t('admin.toolbar_new_author'), ICON_PLUS);
  toolbar.appendChild(newAuthorBtn);

  // Filter-tabs
  const filters = document.createElement('div');
  filters.className = 'admin-filters';
  main.appendChild(filters);

  const list = document.createElement('div');
  list.className = 'admin-author-list';
  list.textContent = t('common.loading');
  main.appendChild(list);

  const state: ListState = { filter: 'all', authors: [] };

  function rerender(): void {
    renderFilterButtons(filters, state, () => {
      rerender();
    });
    renderList(list, state, statusBox);
  }

  csvBtn.addEventListener('click', () => {
    openCsvImportModal(() => {
      void loadAuthors(state, rerender, statusBox);
    });
  });

  excelBtn.addEventListener('click', () => {
    openExcelImportModal(() => {
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
  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .order('last_name', { ascending: true });

  if (error !== null) {
    reportError('admin.loadAuthors', error);
    showStatus(statusBox, 'error', `Auteurs laden faalde: ${error.message}`);
    state.authors = [];
    onLoaded();
    return;
  }

  state.authors = data;
  onLoaded();
}

// =============================================================================
// Filter-buttons
// =============================================================================
function renderFilterButtons(container: HTMLElement, state: ListState, onChange: () => void): void {
  container.replaceChildren();

  const counts = countByStatus(state.authors);
  const items: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: t('admin.filter_all'), count: state.authors.length },
    {
      value: 'pending_admin_review',
      label: t('admin.filter_pending_review'),
      count: counts.pending_admin_review,
    },
    { value: 'pending_data', label: t('admin.filter_pending_data'), count: counts.pending_data },
    { value: 'active', label: t('admin.filter_active'), count: counts.active },
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

function countByStatus(authors: AuthorRow[]): Record<OnboardingStatus, number> {
  const counts: Record<OnboardingStatus, number> = {
    pending_data: 0,
    pending_admin_review: 0,
    active: 0,
  };
  for (const a of authors) {
    if (a.is_admin) {
      continue;
    }
    counts[a.onboarding_status]++;
  }
  return counts;
}

// =============================================================================
// Lijst + cards
// =============================================================================
function renderList(container: HTMLElement, state: ListState, statusBox: HTMLElement): void {
  container.replaceChildren();

  const filtered = state.authors.filter((a) => {
    if (a.is_admin) {
      // Admins altijd zichtbaar in 'all' + 'active'
      return state.filter === 'all' || state.filter === 'active';
    }
    if (state.filter === 'all') {
      return true;
    }
    return a.onboarding_status === state.filter;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = t('admin.empty_filter');
    container.appendChild(empty);
    return;
  }

  for (const author of filtered) {
    container.appendChild(
      renderAuthorCard(
        author,
        () => {
          // Refresh na actie
          void supabase
            .from('authors')
            .select('*')
            .eq('id', author.id)
            .maybeSingle()
            .then((r) => {
              if (r.data !== null) {
                const idx = state.authors.findIndex((a) => a.id === author.id);
                if (idx >= 0) {
                  state.authors[idx] = r.data;
                  renderList(container, state, statusBox);
                }
              }
              return undefined;
            });
        },
        statusBox
      )
    );
  }
}

function renderAuthorCard(
  author: AuthorRow,
  onChanged: () => void,
  statusBox: HTMLElement
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'admin-author-card';

  const row = document.createElement('div');
  row.className = 'admin-author-row';

  const main = document.createElement('div');
  main.className = 'admin-author-main';

  const name = document.createElement('div');
  name.className = 'admin-author-name';
  name.textContent = `${author.first_name} ${author.last_name}`;
  main.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'admin-author-meta';
  const parts: string[] = [author.email];
  if (author.netsuite_vendor_id !== null) {
    parts.push(`Vendor ${author.netsuite_vendor_id}`);
  }
  if (author.invited_at !== null) {
    parts.push(t('admin.invited_at').replace('{date}', formatShortDate(author.invited_at)));
  }
  if (author.reminder_sent_at !== null) {
    parts.push(t('admin.reminder_at').replace('{date}', formatShortDate(author.reminder_sent_at)));
  }
  if (author.activated_at !== null) {
    parts.push(t('admin.activated_at').replace('{date}', formatShortDate(author.activated_at)));
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  row.appendChild(main);

  // Actie-knoppen rechts
  const actions = document.createElement('div');
  actions.className = 'admin-author-actions';

  if (!author.is_admin) {
    if (author.onboarding_status === 'pending_data') {
      // Eerste invite OF reminder
      const isReminderEligible =
        author.invited_at !== null && daysSince(author.invited_at) >= REMINDER_THRESHOLD_DAYS;

      if (author.invited_at === null) {
        actions.appendChild(
          buildActionBtn(t('admin.btn_send_invite'), () => {
            void invokeCreateAccounts(author, 'invite', statusBox).then(onChanged);
          })
        );
      } else if (isReminderEligible) {
        actions.appendChild(
          buildActionBtn(t('admin.btn_send_reminder'), () => {
            void invokeCreateAccounts(author, 'invite', statusBox).then(onChanged);
          })
        );
      } else {
        const dim = document.createElement('span');
        dim.className = 'admin-author-hint';
        const days = REMINDER_THRESHOLD_DAYS - daysSince(author.invited_at);
        dim.textContent = t('admin.reminder_in_days').replace('{days}', String(days));
        actions.appendChild(dim);
      }
    } else if (author.onboarding_status === 'pending_admin_review') {
      actions.appendChild(
        buildActionBtn(t('admin.btn_activate'), () => {
          void invokeCreateAccounts(author, 'activate', statusBox).then(onChanged);
        })
      );
    }
  }

  if (!author.is_admin && author.onboarding_status === 'active') {
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'admin-expand';
    expandBtn.textContent = t('admin.btn_upload_statement');
    expandBtn.addEventListener('click', () => {
      toggleUploadPanel(card, author);
    });
    actions.appendChild(expandBtn);
  }

  row.appendChild(actions);

  // Status-badge
  row.appendChild(buildStatusBadge(author));

  card.appendChild(row);
  return card;
}

function buildStatusBadge(author: AuthorRow): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'admin-author-status';

  if (author.is_admin) {
    badge.textContent = t('admin.status_admin');
    badge.classList.add('status-admin');
    return badge;
  }

  switch (author.onboarding_status) {
    case 'pending_data':
      badge.textContent = t('admin.status_pending_data');
      badge.classList.add('status-pending-data');
      break;
    case 'pending_admin_review':
      badge.textContent = t('admin.status_pending_review');
      badge.classList.add('status-pending-review');
      break;
    case 'active':
      badge.textContent = t('admin.status_active');
      badge.classList.add('status-active');
      break;
  }
  return badge;
}

function buildActionBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-activate';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function toggleUploadPanel(card: HTMLElement, author: AuthorRow): void {
  const existing = card.querySelector('.admin-upload-panel');
  if (existing !== null) {
    existing.remove();
    return;
  }
  const panel = document.createElement('div');
  panel.className = 'admin-upload-panel';
  panel.appendChild(
    buildStatementUploadForm(author, () => {
      panel.remove();
    })
  );
  card.appendChild(panel);
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

  const fnError = extractFnError(result.error);
  if (fnError !== null) {
    reportError('admin.invokeCreateAccounts', fnError);
    showStatus(statusBox, 'error', `Actie faalde: ${fnError.message}`);
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

function extractFnError(errVal: unknown): Error | null {
  if (errVal instanceof Error) {
    return errVal;
  }
  if (typeof errVal === 'string') {
    return new Error(errVal);
  }
  if (errVal !== null && errVal !== undefined) {
    return new Error('Edge Function call failed');
  }
  return null;
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

  // Insert (status default = pending_data)
  const { data, error } = await supabase
    .from('authors')
    .insert({
      ...values,
      is_admin: false,
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

  const inviteResult = await supabase.functions.invoke<CreateAccountsResult>('create-accounts', {
    body: { author_id: insertedId, email: insertedEmail, mode: 'invite' },
  });

  const fnErr = extractFnError(inviteResult.error);
  const firstResult = inviteResult.data?.results?.[0];
  const failed = fnErr !== null || firstResult === undefined || firstResult.status === 'failed';

  if (failed) {
    submit.disabled = false;
    submit.textContent = t('admin.new_author_submit');
    const reason = fnErr?.message ?? firstResult?.error ?? 'onbekend';
    showStatus(
      statusBox,
      'error',
      `Auteur aangemaakt maar invite-mail faalde (${reason}). Klik op "Stuur uitnodiging" in de lijst.`
    );
    onCreated();
    return;
  }

  form.remove();
  showStatus(
    statusBox,
    'success',
    `${values.email} aangemaakt — invite-mail verstuurd. Auteur vult eigen profiel aan.`
  );
  onCreated();
}

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

function buildToolbarBtn(label: string, iconSvg: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-action';

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

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear())}`;
}
