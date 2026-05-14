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
import { openContractUploadModal } from './admin/contract-upload';
import { openNewAuthorModal } from './admin/new-author-modal';
import { openAuthorPickerModal } from './admin/author-picker';
import { extractFnError, formatFnErrorMessage } from '@/lib/edge-function-errors';
import { buildAppHeader } from './shared/header';

/** Vier statussen die de admin in de UI ziet. */
type AdminStatus = 'persoonsgegevens' | 'statements' | 'gereed' | 'actief';

type FilterValue = 'all' | AdminStatus;

interface ListState {
  filter: FilterValue;
  /** Vrije-tekst-zoekopdracht; vergelijkt case-insensitive met naam + email. */
  search: string;
  authors: AuthorRow[];
  /** Set van author-IDs die ten minste één `payments`-rij hebben. */
  paymentsByAuthor: Set<string>;
}

/** Twee tabs in het admin-portaal. Keuze wordt in localStorage bewaard. */
type AdminTab = 'accounts' | 'persoonsgegevens';
const TAB_STORAGE_KEY = 'admin-tab';

function getInitialTab(): AdminTab {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (stored === 'accounts' || stored === 'persoonsgegevens') {
      return stored;
    }
  } catch {
    // localStorage kan in private-browsing geblokkeerd zijn — val terug op default
  }
  return 'accounts';
}

function persistTab(tab: AdminTab): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // best-effort
  }
}

export function renderAdminView(root: HTMLElement, admin: AuthorRow): void {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'app-shell';
  layout.appendChild(buildAppHeader(admin));

  const main = document.createElement('main');
  main.className = 'admin-content';
  layout.appendChild(main);

  // Section-header met tab-bar
  main.appendChild(buildSectionHeader());

  // -- Gedeeld state-object: authors + payments. Eén bron van waarheid die
  // beide tabs gebruiken (Accounts-tab toont auteurslijst, Persoonsgegevens
  // gebruikt 'm voor de change-requests-section).
  const state: ListState = {
    filter: 'all',
    search: '',
    authors: [],
    paymentsByAuthor: new Set(),
  };

  const statusBox = document.createElement('div');
  statusBox.className = 'admin-status';
  statusBox.hidden = true;
  main.appendChild(statusBox);

  // -- Tab-bar
  let currentTab = getInitialTab();
  const tabBar = document.createElement('nav');
  tabBar.className = 'admin-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  main.appendChild(tabBar);

  const tabPanel = document.createElement('div');
  tabPanel.className = 'admin-tab-panel';
  main.appendChild(tabPanel);

  const switchTab = (next: AdminTab): void => {
    currentTab = next;
    persistTab(next);
    renderTabBar();
    renderActiveTab();
  };

  function renderTabBar(): void {
    tabBar.replaceChildren();
    const tabs: { value: AdminTab; label: string }[] = [
      { value: 'accounts', label: t('admin.tab_accounts') },
      { value: 'persoonsgegevens', label: t('admin.tab_persoonsgegevens') },
    ];
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-tab-btn';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(tab.value === currentTab));
      if (tab.value === currentTab) {
        btn.classList.add('admin-tab-btn--active');
      }
      btn.textContent = tab.label;
      btn.addEventListener('click', () => {
        switchTab(tab.value);
      });
      tabBar.appendChild(btn);
    }
  }

  function rerenderAccounts(
    statsEl: HTMLElement,
    filtersEl: HTMLElement,
    listEl: HTMLElement
  ): void {
    const refresh = (): void => {
      rerenderAccounts(statsEl, filtersEl, listEl);
    };
    renderStatsStrip(statsEl, state, refresh);
    renderFilterButtons(filtersEl, state, refresh);
    renderList(listEl, state, statusBox);
  }

  function renderActiveTab(): void {
    tabPanel.replaceChildren();
    if (currentTab === 'accounts') {
      renderAccountsTab(tabPanel, state, statusBox, () => {
        void loadAuthors(
          state,
          () => {
            // re-render filter + stats + lijst zonder de hele tab opnieuw te tekenen
            const statsEl = tabPanel.querySelector('.admin-stats-strip');
            const filtersEl = tabPanel.querySelector('.admin-filters');
            const listEl = tabPanel.querySelector('.admin-author-list');
            if (
              statsEl instanceof HTMLElement &&
              filtersEl instanceof HTMLElement &&
              listEl instanceof HTMLElement
            ) {
              rerenderAccounts(statsEl, filtersEl, listEl);
            }
          },
          statusBox
        );
      });
    } else {
      renderPersoonsgegevensTab(tabPanel, admin.id, state, statusBox);
    }
  }

  renderTabBar();

  // Eerst auteurs laden, dan tab tonen — voorkomt flicker van 'leeg' → 'vol'.
  void loadAuthors(state, renderActiveTab, statusBox);

  root.appendChild(layout);
}

// =============================================================================
// Section-header (overline + heading boven de tabs)
// =============================================================================
function buildSectionHeader(): HTMLElement {
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

  return sectionHeader;
}

// =============================================================================
// Tab "Accounts"
// =============================================================================
function renderAccountsTab(
  container: HTMLElement,
  state: ListState,
  statusBox: HTMLElement,
  onAuthorsChanged: () => void
): void {
  // ---- Stats-strip: 4 klikbare tegels die direct als filter werken
  const stats = document.createElement('div');
  stats.className = 'admin-stats-strip';
  container.appendChild(stats);

  // ---- Toolbar: search-veld + filter-pills (één rij, wrap op mobiel)
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-list-toolbar';
  container.appendChild(toolbar);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'admin-search-wrap';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'admin-search-icon';
  searchIcon.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  searchWrap.appendChild(searchIcon);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'admin-search-input';
  searchInput.placeholder = t('admin.search_placeholder');
  searchInput.value = state.search;
  searchInput.setAttribute('aria-label', t('admin.search_placeholder'));
  searchWrap.appendChild(searchInput);
  toolbar.appendChild(searchWrap);

  const filters = document.createElement('div');
  filters.className = 'admin-filters';
  toolbar.appendChild(filters);

  // ---- Author-list (centraal — gebruiker werkt 99% hier)
  const list = document.createElement('div');
  list.className = 'admin-author-list';
  list.textContent = t('common.loading');
  container.appendChild(list);

  // ---- Action-cards onder de lijst — minder gebruikt, dus secundair
  container.appendChild(
    buildActionCard({
      title: t('admin.card_add_authors_title'),
      helpBuilder: buildAddAuthorsHelp,
      buttons: [
        {
          label: t('admin.toolbar_excel_import'),
          icon: ICON_DOWNLOAD,
          tooltip: t('admin.tooltip_excel_import'),
          variant: 'primary',
          onClick: () => {
            openExcelImportModal(onAuthorsChanged);
          },
        },
        {
          label: t('admin.toolbar_new_author'),
          icon: ICON_PLUS,
          tooltip: t('admin.tooltip_new_author'),
          variant: 'secondary',
          onClick: () => {
            openNewAuthorModal(onAuthorsChanged);
          },
        },
      ],
    })
  );

  container.appendChild(
    buildActionCard({
      title: t('admin.card_bulk_statements_title'),
      helpBuilder: buildBulkStatementsHelp,
      buttons: [
        {
          label: t('admin.toolbar_bulk_statements'),
          icon: ICON_UPLOAD,
          tooltip: t('admin.tooltip_bulk_statements'),
          variant: 'primary',
          onClick: () => {
            openBulkStatementUploadModal(onAuthorsChanged);
          },
        },
        {
          label: t('admin.btn_upload_contract'),
          icon: ICON_PLUS,
          tooltip: t('admin.tooltip_upload_contract'),
          variant: 'secondary',
          onClick: () => {
            openAuthorPickerModal(state.authors, (author) => {
              openContractUploadModal(author, onAuthorsChanged);
            });
          },
        },
      ],
    })
  );

  const rerender = (): void => {
    renderFilterButtons(filters, state, rerender);
    renderStatsStrip(stats, state, rerender);
    renderList(list, state, statusBox);
  };

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value;
    renderList(list, state, statusBox);
  });

  rerender();
}

/**
 * Stats-strip: vier klikbare tegels die direct als filter werken. Geeft de
 * admin in één oogopslag inzicht in wat er nog te doen valt: "5 wachten op
 * data", "3 klaar voor activatie". Tegels zijn klikbaar — kortere weg naar
 * de bijbehorende lijst-view.
 */
function renderStatsStrip(container: HTMLElement, state: ListState, onChange: () => void): void {
  container.replaceChildren();
  const counts = countByDerivedStatus(state);
  const tiles: { value: AdminStatus; label: string; count: number }[] = [
    {
      value: 'persoonsgegevens',
      label: t('admin.status_persoonsgegevens_short'),
      count: counts.persoonsgegevens,
    },
    { value: 'statements', label: t('admin.status_statements_short'), count: counts.statements },
    { value: 'gereed', label: t('admin.status_gereed_short'), count: counts.gereed },
    { value: 'actief', label: t('admin.status_actief_short'), count: counts.actief },
  ];

  for (const tile of tiles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `admin-stat-tile admin-stat-tile--${tile.value}`;
    if (state.filter === tile.value) {
      btn.classList.add('admin-stat-tile--active');
    }

    const value = document.createElement('span');
    value.className = 'admin-stat-tile-value';
    value.textContent = String(tile.count);
    btn.appendChild(value);

    const label = document.createElement('span');
    label.className = 'admin-stat-tile-label';
    label.textContent = tile.label;
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      state.filter = state.filter === tile.value ? 'all' : tile.value;
      onChange();
    });
    container.appendChild(btn);
  }
}

// =============================================================================
// Tab "Persoonsgegevens"
// =============================================================================
function renderPersoonsgegevensTab(
  container: HTMLElement,
  adminId: string,
  state: ListState,
  statusBox: HTMLElement
): void {
  // ---- Wachtende wijzigingsverzoeken (gerenderd door bestaande module)
  const changesWrapper = document.createElement('section');
  changesWrapper.className = 'admin-section admin-section--changes';
  container.appendChild(changesWrapper);

  const refreshChanges = (): void => {
    changesWrapper.replaceChildren();
    void renderChangesSection(changesWrapper, adminId, refreshChanges);
  };
  refreshChanges();

  // ---- Action-card: Export naar NetSuite
  container.appendChild(
    buildActionCard({
      title: t('admin.card_export_title'),
      helpBuilder: buildExportHelp,
      buttons: [
        {
          label: t('admin.toolbar_csv_export'),
          icon: ICON_UPLOAD,
          tooltip: t('admin.tooltip_csv_export'),
          variant: 'primary',
          onClick: () => {
            openCsvExportModal(state.authors, () => {
              void loadAuthors(state, () => undefined, statusBox);
            });
          },
        },
      ],
    })
  );
}

// =============================================================================
// Action-card helper
// =============================================================================
interface ActionCardButton {
  label: string;
  icon: string;
  tooltip?: string;
  variant: 'primary' | 'secondary';
  onClick: () => void;
}

interface ActionCardOpts {
  title: string;
  /**
   * Optional builder die de inhoud van een collapsible "Hoe werkt dit?"-
   * panel opbouwt. Wanneer omitted, krijgt de card geen help-dropdown.
   */
  helpBuilder?: (root: HTMLElement) => void;
  buttons: ActionCardButton[];
}

function buildActionCard(opts: ActionCardOpts): HTMLElement {
  const card = document.createElement('section');
  card.className = 'admin-action-card';

  // -- Bovenste rij: titel pakt alle resterende ruimte (flex:1), help-toggle
  // hangt vóór de knoppen — zo lijnt de toggle bij elke card uit op dezelfde
  // x-positie (vlak naast de actie-knoppen rechts).
  const topRow = document.createElement('div');
  topRow.className = 'admin-action-card-top';

  const h3 = document.createElement('h3');
  h3.className = 'admin-action-card-title';
  h3.textContent = opts.title;
  topRow.appendChild(h3);

  let helpBody: HTMLElement | undefined;
  let helpToggle: HTMLButtonElement | undefined;
  if (opts.helpBuilder !== undefined) {
    helpToggle = document.createElement('button');
    helpToggle.type = 'button';
    helpToggle.className = 'admin-action-card-help-toggle';
    helpToggle.setAttribute('aria-expanded', 'false');
    helpToggle.textContent = t('admin.action_help_summary');
    topRow.appendChild(helpToggle);
  }

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'admin-action-card-buttons';
  for (const btnSpec of opts.buttons) {
    const btn = buildToolbarBtn(btnSpec.label, btnSpec.icon, btnSpec.tooltip);
    btn.classList.add(`admin-action--${btnSpec.variant}`);
    btn.addEventListener('click', btnSpec.onClick);
    buttonsRow.appendChild(btn);
  }
  topRow.appendChild(buttonsRow);

  card.appendChild(topRow);

  // -- Help-panel onder de top-row; standaard verborgen
  if (opts.helpBuilder !== undefined && helpToggle !== undefined) {
    helpBody = document.createElement('div');
    helpBody.className = 'admin-action-card-help-body';
    helpBody.hidden = true;
    opts.helpBuilder(helpBody);
    card.appendChild(helpBody);

    helpToggle.addEventListener('click', () => {
      const expanded = helpToggle.getAttribute('aria-expanded') === 'true';
      helpToggle.setAttribute('aria-expanded', String(!expanded));
      if (helpBody !== undefined) {
        helpBody.hidden = expanded;
      }
    });
  }

  return card;
}

// =============================================================================
// Help-panel builders (rijke uitleg per action-card)
// =============================================================================
function buildAddAuthorsHelp(root: HTMLElement): void {
  appendParagraph(root, t('admin.card_add_authors_help_intro'));

  const dl = document.createElement('dl');
  dl.className = 'admin-help-dl';

  appendDlEntry(
    dl,
    t('admin.card_add_authors_help_existing_label'),
    t('admin.card_add_authors_help_existing_text')
  );
  appendDlEntry(
    dl,
    t('admin.card_add_authors_help_new_label'),
    t('admin.card_add_authors_help_new_text')
  );

  root.appendChild(dl);

  appendParagraph(root, t('admin.card_add_authors_help_outro'), 'admin-help-note');
}

function buildBulkStatementsHelp(root: HTMLElement): void {
  appendParagraph(root, t('admin.card_bulk_statements_help_intro'));

  // -- Bestand 1: PDF
  const h4Pdf = document.createElement('h4');
  h4Pdf.className = 'admin-help-subheading';
  h4Pdf.textContent = t('admin.card_bulk_statements_help_pdf_heading');
  root.appendChild(h4Pdf);

  appendParagraph(root, t('admin.card_bulk_statements_help_pdf_para'));

  const filenameLabel = document.createElement('p');
  filenameLabel.className = 'admin-help-small-label';
  filenameLabel.textContent = t('admin.card_bulk_statements_help_filename_label');
  root.appendChild(filenameLabel);

  const code = document.createElement('code');
  code.className = 'admin-help-code';
  code.textContent = 'NU_SC_<AlliantID>_<Naam>_<YYYYMM>.pdf';
  root.appendChild(code);

  const exampleLabel = document.createElement('p');
  exampleLabel.className = 'admin-help-small-label';
  exampleLabel.textContent = t('admin.card_bulk_statements_help_example_label');
  root.appendChild(exampleLabel);

  const exampleCode = document.createElement('code');
  exampleCode.className = 'admin-help-code';
  exampleCode.textContent = 'NU_SC_2651307_G. de Jong_202512.pdf';
  root.appendChild(exampleCode);

  // -- Bestand 2: Excel
  const h4Xl = document.createElement('h4');
  h4Xl.className = 'admin-help-subheading';
  h4Xl.textContent = t('admin.card_bulk_statements_help_excel_heading');
  root.appendChild(h4Xl);

  appendParagraph(root, t('admin.card_bulk_statements_help_excel_para'));

  // Voorbeeld-tabel
  const table = document.createElement('table');
  table.className = 'admin-help-table';
  const thead = document.createElement('thead');
  const trHead = document.createElement('tr');
  for (const col of ['alliant_id', 'amount', 'yyyymm']) {
    const th = document.createElement('th');
    th.textContent = col;
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const exampleRows: [string, string, string][] = [
    ['2651307', '1234.56', '202512'],
    ['2644800', '750.25', t('admin.card_bulk_statements_help_empty_cell')],
  ];
  for (const row of exampleRows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);

  // Kolom-uitleg
  const dl = document.createElement('dl');
  dl.className = 'admin-help-dl';
  appendDlEntry(dl, 'alliant_id', t('admin.card_bulk_statements_help_col_alliant'));
  appendDlEntry(dl, 'amount', t('admin.card_bulk_statements_help_col_amount'));
  appendDlEntry(dl, 'yyyymm', t('admin.card_bulk_statements_help_col_yyyymm'));
  root.appendChild(dl);

  appendParagraph(root, t('admin.card_bulk_statements_help_outro'), 'admin-help-note');
}

function buildExportHelp(root: HTMLElement): void {
  appendParagraph(root, t('admin.card_export_help_intro'));
  appendParagraph(root, t('admin.card_export_help_workflow'));
  appendParagraph(root, t('admin.card_export_help_safety'), 'admin-help-note');
}

function appendParagraph(root: HTMLElement, text: string, extraClass?: string): void {
  const p = document.createElement('p');
  p.className = `admin-help-p${extraClass !== undefined ? ' ' + extraClass : ''}`;
  p.textContent = text;
  root.appendChild(p);
}

function appendDlEntry(dl: HTMLElement, term: string, desc: string): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  dl.appendChild(dt);
  const dd = document.createElement('dd');
  dd.textContent = desc;
  dl.appendChild(dd);
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
 * Bepaalt de UI-status puur op basis van `onboarding_status` + payments-
 * aanwezigheid. We kijken bewust NIET meer naar individuele data-velden:
 *   - Bestaande auteurs (Excel-import) starten al op pending_admin_review
 *     en springen meteen naar "statements" of "gereed", ook al staat
 *     bijvoorbeeld phone leeg.
 *   - Nieuwe auteurs starten op pending_data en blijven daar tot ze in
 *     hun eigen profile-tab op "Verzend gegevens" klikken — die knop
 *     bewaakt zelf datacompleetheid.
 *
 * Volgorde-ladder (eerste match wint):
 *   1. `actief`         — admin of `onboarding_status='active'`.
 *   2. `persoonsgegevens` — `onboarding_status='pending_data'` (nieuwe
 *      auteur die nog niet heeft ingediend).
 *   3. `gereed`         — heeft ingediend (pending_admin_review) én er
 *      staat minstens één statement: admin mag activeren.
 *   4. `statements`     — heeft ingediend (of via Excel-import direct
 *      in deze status), maar nog geen statements geupload.
 */
export function deriveAdminStatus(author: AuthorRow, hasPayments: boolean): AdminStatus {
  if (author.is_admin || author.onboarding_status === 'active') {
    return 'actief';
  }
  if (author.onboarding_status === 'pending_data') {
    return 'persoonsgegevens';
  }
  // pending_admin_review
  if (hasPayments) {
    return 'gereed';
  }
  return 'statements';
}

// =============================================================================
// Filter-buttons
// =============================================================================
function renderFilterButtons(container: HTMLElement, state: ListState, onChange: () => void): void {
  container.replaceChildren();

  const counts = countByDerivedStatus(state);
  const items: { value: FilterValue; label: string; count: number }[] = [
    {
      value: 'all',
      label: t('admin.filter_all'),
      count: state.authors.filter((a) => !a.is_admin).length,
    },
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
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.setAttribute('aria-pressed', 'false');
    }

    const label = document.createElement('span');
    label.className = 'admin-filter-btn-label';
    label.textContent = item.label;
    btn.appendChild(label);

    const count = document.createElement('span');
    count.className = 'admin-filter-btn-count';
    count.textContent = String(item.count);
    btn.appendChild(count);

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
    // Admin-accounts horen niet in het auteursbeheer-overzicht.
    if (a.is_admin) {
      continue;
    }
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

  const needle = state.search.trim().toLowerCase();
  const filtered = state.authors.filter((a) => {
    // Admin-accounts horen niet in het auteursbeheer-overzicht.
    if (a.is_admin) {
      return false;
    }
    if (state.filter !== 'all') {
      const status = deriveAdminStatus(a, state.paymentsByAuthor.has(a.id));
      if (status !== state.filter) {
        return false;
      }
    }
    if (needle !== '') {
      const haystack = `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase();
      if (!haystack.includes(needle)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    if (needle !== '') {
      empty.textContent = t('admin.search_no_results').replace('{q}', state.search);
    } else {
      empty.textContent = t('admin.empty_filter');
    }
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

  // Tweede regel: email + aangemaakt-datum + (optioneel) vendor en/of meest
  // recente lifecycle-datum. Eén regel om de card-hoogte compact te houden.
  const meta = document.createElement('div');
  meta.className = 'admin-author-meta';
  const parts: string[] = [
    author.email,
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
// Helpers
// =============================================================================
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
