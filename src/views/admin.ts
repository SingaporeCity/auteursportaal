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
import { openAuthorDetailPanel } from './admin/author-detail-panel';
import { openChoiceModal } from './admin/choice-modal';
import { openIdKoppelModal } from './admin/id-koppel-modal';
import { openConfirmModal } from './shared/confirm-modal';
import { deleteAuthor } from '@/lib/delete-author';
import { openBulkDeleteModal } from './admin/bulk-delete-modal';
import type { PaymentType } from '@/types/db';
import { extractFnError, formatFnErrorMessage } from '@/lib/edge-function-errors';
import { buildAppHeader } from './shared/header';

/** Vijf statussen die de admin in de UI ziet (in volgorde van flow). */
type AdminStatus = 'persoonsgegevens' | 'id_koppelen' | 'statements' | 'gereed' | 'actief';

type FilterValue = 'all' | AdminStatus;

interface ListState {
  filter: FilterValue;
  authors: AuthorRow[];
  /** Set van author-IDs die ten minste één `payments`-rij hebben. */
  paymentsByAuthor: Set<string>;
  /**
   * Hoeveel rijen we momenteel tonen. Initieel 50, klimt in stappen van 50
   * via "Toon meer". Reset bij filter- of search-wijziging zodat een nieuwe
   * zoekopdracht weer bij de eerste 50 begint.
   */
  visibleCount: number;
  /** True tot de eerste loadAuthors-call gefinaliseerd is (success of error).
   *  Stuurt of `renderList` skeleton-cards of echte content laat zien. */
  loading: boolean;
  /**
   * Auteurs die de admin heeft aangevinkt voor bulk-acties (verwijderen).
   * Set blijft behouden bij filter/search-wijzigingen — geselecteerde ID's
   * die buiten de huidige filter vallen blijven aangevinkt onderwater zodat
   * de admin een combinatie kan opbouwen via meerdere zoekslagen.
   */
  selectedIds: Set<string>;
}

const PAGE_SIZE = 50;
/** Supabase hard-limiteert standaard op 1000 rijen — expliciet ophogen zodat
 *  we tot 5000 auteurs ophalen zonder silent cutoff. Boven die grens moet
 *  echte paginering komen. */
const MAX_FETCH = 5000;

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

  // -- Gedeeld state-object: authors + payments. Eén bron van waarheid die
  // beide tabs gebruiken (Accounts-tab toont auteurslijst, Persoonsgegevens
  // gebruikt 'm voor de change-requests-section).
  const state: ListState = {
    filter: 'all',
    authors: [],
    paymentsByAuthor: new Set(),
    visibleCount: PAGE_SIZE,
    loading: true,
    selectedIds: new Set(),
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

  function rerenderAccounts(statsEl: HTMLElement, listEl: HTMLElement): void {
    const refresh = (): void => {
      rerenderAccounts(statsEl, listEl);
    };
    renderStatsStrip(statsEl, state, refresh);
    renderList(listEl, state, statusBox, refresh);
  }

  function renderActiveTab(): void {
    tabPanel.replaceChildren();
    if (currentTab === 'accounts') {
      renderAccountsTab(tabPanel, state, statusBox, () => {
        void loadAuthors(
          state,
          () => {
            const statsEl = tabPanel.querySelector('.admin-stats-strip');
            const listEl = tabPanel.querySelector('.admin-author-list');
            if (statsEl instanceof HTMLElement && listEl instanceof HTMLElement) {
              rerenderAccounts(statsEl, listEl);
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
// Keuze-modals voor "Auteur toevoegen" en "Documenten uploaden". Beide
// gebruiken `openChoiceModal` als presentatie-laag en routen door naar de
// bestaande gespecialiseerde modals.
// =============================================================================

const ICON_USER_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';

const ICON_USERS_EXCEL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8h4M21 6v4"/></svg>';

const ICON_FILE_TEXT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

const ICON_CONTRACT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 12h2M8 16h6"/><path d="M14 17l1.5 1.5L18 16"/></svg>';

const ICON_INVOICE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9.5 13.5c0-.83.67-1.5 1.5-1.5h2c.83 0 1.5.67 1.5 1.5S13.83 15 13 15h-2c-.83 0-1.5.67-1.5 1.5S10.17 18 11 18h2c.83 0 1.5-.67 1.5-1.5"/></svg>';

function openAddAuthorChoice(onAuthorsChanged: () => void): void {
  openChoiceModal({
    title: t('admin.add_author_choice_title'),
    intro: t('admin.add_author_choice_intro'),
    modalClassName: 'choice-modal--add-author',
    tiles: [
      {
        id: 'new',
        label: t('admin.add_author_choice_new'),
        description: t('admin.add_author_choice_new_desc'),
        icon: ICON_USER_PLUS,
        onPick: () => {
          openNewAuthorModal(onAuthorsChanged);
        },
      },
      {
        id: 'existing',
        label: t('admin.add_author_choice_existing'),
        description: t('admin.add_author_choice_existing_desc'),
        icon: ICON_USERS_EXCEL,
        onPick: () => {
          openExcelImportModal(onAuthorsChanged);
        },
      },
    ],
  });
}

function openUploadChoice(onAuthorsChanged: () => void): void {
  const openStatement = (type: PaymentType): void => {
    openBulkStatementUploadModal(onAuthorsChanged, type);
  };

  openChoiceModal({
    title: t('admin.upload_choice_title'),
    intro: t('admin.upload_choice_intro'),
    modalClassName: 'choice-modal--upload',
    tiles: [
      {
        id: 'royalty',
        label: t('admin.bulk_stmt_type_royalty'),
        description: t('admin.upload_choice_royalty_desc'),
        icon: ICON_FILE_TEXT,
        onPick: () => {
          openStatement('royalty');
        },
      },
      {
        id: 'subsidiary',
        label: t('admin.bulk_stmt_type_subsidiary'),
        description: t('admin.upload_choice_subsidiary_desc'),
        icon: ICON_FILE_TEXT,
        onPick: () => {
          openStatement('subsidiary');
        },
      },
      {
        id: 'foreign',
        label: t('admin.bulk_stmt_type_foreign'),
        description: t('admin.upload_choice_foreign_desc'),
        icon: ICON_FILE_TEXT,
        onPick: () => {
          openStatement('foreign');
        },
      },
      {
        id: 'jaaropgave',
        label: t('admin.bulk_stmt_type_jaaropgave'),
        description: t('admin.upload_choice_jaaropgave_desc'),
        icon: ICON_FILE_TEXT,
        onPick: () => {
          openStatement('jaaropgave');
        },
      },
      {
        id: 'contracts',
        label: t('admin.upload_choice_contracts'),
        description: t('admin.upload_choice_contracts_desc'),
        icon: ICON_CONTRACT,
        comingSoonLabel: t('admin.coming_soon'),
        // Disabled — bulk-contract-upload nog niet gebouwd. Per-auteur
        // contract-upload blijft beschikbaar via het detail-paneel.
        onPick: () => {
          // Disabled — handler wordt niet aangeroepen zolang
          // comingSoonLabel gezet is.
        },
      },
      {
        id: 'invoices',
        label: t('admin.upload_choice_invoices'),
        description: t('admin.upload_choice_invoices_desc'),
        icon: ICON_INVOICE,
        comingSoonLabel: t('admin.coming_soon'),
        onPick: () => {
          // Disabled — handler wordt niet aangeroepen zolang
          // comingSoonLabel gezet is.
        },
      },
    ],
  });
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
  // ---- Action-tiles (Auteur toevoegen + Documenten uploaden) — twee
  // naast elkaar met primary-tint icoon-blok. Worden onderaan in de
  // container ingehangen (na lijst) zodat de auteurslijst meteen
  // bovenaan zichtbaar is; admin scrolt voor zelden-gebruikte acties.
  const actionGrid = document.createElement('div');
  actionGrid.className = 'admin-action-grid';

  actionGrid.appendChild(
    buildActionCard({
      title: t('admin.card_add_authors_title'),
      iconSvg: ICON_USER_PLUS,
      helpBuilder: buildAddAuthorsHelp,
      buttons: [
        {
          label: t('admin.btn_add_author'),
          icon: ICON_PLUS,
          tooltip: t('admin.tooltip_add_author'),
          variant: 'primary',
          onClick: () => {
            openAddAuthorChoice(onAuthorsChanged);
          },
        },
      ],
    })
  );

  actionGrid.appendChild(
    buildActionCard({
      title: t('admin.card_documents_title'),
      iconSvg: ICON_UPLOAD_BIG,
      helpBuilder: buildBulkStatementsHelp,
      buttons: [
        {
          label: t('admin.btn_upload_documents'),
          icon: ICON_UPLOAD,
          tooltip: t('admin.tooltip_upload_documents'),
          variant: 'primary',
          onClick: () => {
            openUploadChoice(onAuthorsChanged);
          },
        },
      ],
    })
  );

  // ---- Stats-strip: 4 klikbare tegels die direct als filter werken
  const stats = document.createElement('div');
  stats.className = 'admin-stats-strip';
  container.appendChild(stats);

  // ---- Bulk-actie-bar (alleen zichtbaar als auteurs zijn aangevinkt).
  const bulkBar = document.createElement('div');
  bulkBar.className = 'admin-bulk-bar';
  bulkBar.hidden = true;
  container.appendChild(bulkBar);

  // ---- Author-list — hoofdcontent, direct onder de toolbar.
  const list = document.createElement('div');
  list.className = 'admin-author-list';
  container.appendChild(list);

  // Action-tiles onderaan — zelden-gebruikte acties, lijst krijgt voorrang.
  container.appendChild(actionGrid);

  const rerender = (): void => {
    renderStatsStrip(stats, state, rerender);
    renderBulkBar(bulkBar, state, rerender, statusBox);
    renderList(list, state, statusBox, rerender);
  };

  rerender();
}

/**
 * Stats-strip: vijf klikbare tegels die direct als filter werken. Geeft de
 * admin in één oogopslag inzicht in wat er nog te doen valt. Tegels zijn
 * klikbaar — kortere weg naar de bijbehorende lijst-view.
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
    {
      value: 'id_koppelen',
      label: t('admin.status_id_koppelen_short'),
      count: counts.id_koppelen,
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
      state.visibleCount = PAGE_SIZE;
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
            openCsvExportModal(() => {
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
  /** Inline SVG-icoon dat in een primary-tint blok links naast de titel
   *  staat. Vergroot de visuele "actie-tile"-uitstraling. */
  iconSvg?: string;
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

  // -- Bovenste rij: optioneel icoon-blok, dan titel + klein ?-icoon
  //    (links als blok), actie-knoppen rechts.
  const topRow = document.createElement('div');
  topRow.className = 'admin-action-card-top';

  if (opts.iconSvg !== undefined) {
    const iconBlock = document.createElement('div');
    iconBlock.className = 'admin-action-card-icon';
    // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
    iconBlock.innerHTML = opts.iconSvg;
    topRow.appendChild(iconBlock);
  }

  const titleWrap = document.createElement('div');
  titleWrap.className = 'admin-action-card-title-wrap';

  const h3 = document.createElement('h3');
  h3.className = 'admin-action-card-title';
  h3.textContent = opts.title;
  titleWrap.appendChild(h3);

  let helpBody: HTMLElement | undefined;
  let helpToggle: HTMLButtonElement | undefined;
  if (opts.helpBuilder !== undefined) {
    helpToggle = document.createElement('button');
    helpToggle.type = 'button';
    helpToggle.className = 'admin-action-card-help-toggle';
    helpToggle.setAttribute('aria-expanded', 'false');
    helpToggle.setAttribute('aria-label', t('admin.action_help_summary'));
    helpToggle.title = t('admin.action_help_summary');
    helpToggle.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    titleWrap.appendChild(helpToggle);
  }

  topRow.appendChild(titleWrap);

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

  // Labels boven hun tekst (h4 + p), full-width onder elkaar in plaats
  // van een 2-koloms-dl die de tekst rechts ingedrukt zou houden.
  const h4Existing = document.createElement('h4');
  h4Existing.className = 'admin-help-subheading';
  h4Existing.textContent = t('admin.card_add_authors_help_existing_label');
  root.appendChild(h4Existing);
  appendParagraph(root, t('admin.card_add_authors_help_existing_text'));

  const h4New = document.createElement('h4');
  h4New.className = 'admin-help-subheading';
  h4New.textContent = t('admin.card_add_authors_help_new_label');
  root.appendChild(h4New);
  appendParagraph(root, t('admin.card_add_authors_help_new_text'));

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
    supabase
      .from('authors')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, MAX_FETCH - 1),
    supabase
      .from('payments')
      .select('author_id')
      .range(0, MAX_FETCH - 1),
  ]);

  if (authorsResp.error !== null) {
    reportError('admin.loadAuthors', authorsResp.error);
    showStatus(statusBox, 'error', `Auteurs laden faalde: ${authorsResp.error.message}`);
    state.authors = [];
    state.loading = false;
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
  state.loading = false;
  onLoaded();
}

// =============================================================================
// Status-derivatie
// =============================================================================
/**
 * Bepaalt de UI-status puur op basis van `onboarding_status`, NetSuite-
 * koppeling en payments-aanwezigheid. We kijken bewust NIET naar
 * individuele profielvelden:
 *   - Bestaande auteurs (Excel-import) starten al op pending_admin_review
 *     mét Vendor + Alliant ID, en springen meteen naar "statements" of
 *     "gereed".
 *   - Nieuwe auteurs starten op pending_data; nadat ze "Verzend gegevens"
 *     klikken landen ze op `id_koppelen` tot admin de twee IDs invult.
 *
 * Volgorde-ladder (eerste match wint):
 *   1. `actief`           — admin of `onboarding_status='active'`.
 *   2. `persoonsgegevens` — `pending_data` (nieuwe auteur, nog niet
 *      ingediend).
 *   3. `id_koppelen`      — `pending_admin_review` en minstens één van
 *      Vendor/Alliant ID is leeg.
 *   4. `gereed`           — `pending_admin_review` + beide IDs gevuld
 *      + minstens één statement.
 *   5. `statements`       — `pending_admin_review` + beide IDs gevuld
 *      maar geen statements.
 */
export function deriveAdminStatus(author: AuthorRow, hasPayments: boolean): AdminStatus {
  if (author.is_admin || author.onboarding_status === 'active') {
    return 'actief';
  }
  if (author.onboarding_status === 'pending_data') {
    return 'persoonsgegevens';
  }
  // pending_admin_review
  if (author.netsuite_vendor_id === null || author.alliant_id === null) {
    return 'id_koppelen';
  }
  if (hasPayments) {
    return 'gereed';
  }
  return 'statements';
}

function countByDerivedStatus(state: ListState): Record<AdminStatus, number> {
  const counts: Record<AdminStatus, number> = {
    persoonsgegevens: 0,
    id_koppelen: 0,
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

/**
 * Filter-logica voor de auteurslijst — gebruikt door zowel `renderList`
 * als `renderBulkBar` (consistente "selecteer alle zichtbare"-set).
 * Admins worden altijd uitgesloten.
 */
function filterAuthors(state: ListState): AuthorRow[] {
  return state.authors.filter((a) => {
    if (a.is_admin) {
      return false;
    }
    if (state.filter !== 'all') {
      const status = deriveAdminStatus(a, state.paymentsByAuthor.has(a.id));
      if (status !== state.filter) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Sorteer-volgorde voor de auteurslijst. Status is primair sleutel —
 * dezelfde volgorde als de stats-strip (persoonsgegevens → id_koppelen →
 * statements → gereed → actief). Binnen één status wordt nieuwste
 * aanmelddatum eerst getoond (zelfde conventie als DB-query
 * `created_at DESC`).
 */
const STATUS_SORT_ORDER: Record<AdminStatus, number> = {
  persoonsgegevens: 0,
  id_koppelen: 1,
  statements: 2,
  gereed: 3,
  actief: 4,
};

// =============================================================================
// Lijst + cards
// =============================================================================
function renderList(
  container: HTMLElement,
  state: ListState,
  statusBox: HTMLElement,
  rerender: () => void
): void {
  container.replaceChildren();

  // Skeleton-cards tijdens initial load — vervangt de oudere "Aan het laden…"-
  // tekst. Beter ervaarbare wachttijd: gebruiker ziet meteen de structuur die
  // gevuld gaat worden i.p.v. een onbeschreven tekstlabel.
  if (state.loading) {
    for (let i = 0; i < 5; i += 1) {
      container.appendChild(buildSkeletonCard());
    }
    return;
  }

  // Volledige empty-state: geen non-admin auteurs in de hele tabel. Eerste
  // bezoek of demo-omgeving. Toon CTA naar de importeer-acties onderaan.
  const hasAnyAuthor = state.authors.some((a) => !a.is_admin);
  if (!hasAnyAuthor) {
    container.appendChild(buildZeroAuthorsState());
    return;
  }

  const filtered = filterAuthors(state);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'admin-empty';
    empty.textContent = t('admin.empty_filter');
    container.appendChild(empty);
    return;
  }

  // Sorteer primair op status (zelfde volgorde als stats-strip), binnen
  // status op aanmelddatum (nieuwste eerst). `created_at` is een ISO-string
  // dus lexicografische compare = chronologische compare.
  const sorted = filtered.slice().sort((a, b) => {
    const sa = deriveAdminStatus(a, state.paymentsByAuthor.has(a.id));
    const sb = deriveAdminStatus(b, state.paymentsByAuthor.has(b.id));
    if (sa !== sb) {
      return STATUS_SORT_ORDER[sa] - STATUS_SORT_ORDER[sb];
    }
    return b.created_at.localeCompare(a.created_at);
  });

  // Lazy-render: alleen de eerste `visibleCount` cards in DOM. Bij 3000
  // auteurs is 3000 buttons + avatars renderen merkbaar traag — 50 cards
  // op een batch houdt scroll-performance soepel.
  const shown = sorted.slice(0, state.visibleCount);
  for (const author of shown) {
    const onChanged = (): void => {
      refreshOne(state, author.id, rerender);
    };
    container.appendChild(renderAuthorCard(author, state, onChanged, statusBox, rerender));
  }

  // Voet met count + load-more knop wanneer er meer te tonen valt
  const footer = document.createElement('div');
  footer.className = 'admin-list-footer';

  const countLabel = document.createElement('span');
  countLabel.className = 'admin-list-count';
  countLabel.textContent = t('admin.list_count_total')
    .replace('{shown}', String(shown.length))
    .replace('{total}', String(filtered.length));
  footer.appendChild(countLabel);

  if (shown.length < filtered.length) {
    const next = Math.min(PAGE_SIZE, filtered.length - shown.length);
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.type = 'button';
    loadMoreBtn.className = 'admin-load-more';
    loadMoreBtn.textContent = t('admin.btn_load_more').replace('{n}', String(next));
    loadMoreBtn.addEventListener('click', () => {
      state.visibleCount += PAGE_SIZE;
      renderList(container, state, statusBox, rerender);
    });
    footer.appendChild(loadMoreBtn);
  }

  container.appendChild(footer);
}

/**
 * Bulk-actie-bar boven de auteurslijst. Toont een tri-state "selecteer
 * alles"-checkbox + count + "Verwijderen"-knop. De select-all werkt op de
 * huidige filter+search (niet alleen op de eerste `visibleCount` cards) —
 * "alle zichtbare" = alle die door de filter passen, zodat de admin met
 * een statusfilter een hele groep tegelijk kan opruimen.
 */
function renderBulkBar(
  bar: HTMLElement,
  state: ListState,
  rerender: () => void,
  statusBox: HTMLElement
): void {
  bar.replaceChildren();

  const filtered = filterAuthors(state);
  if (filtered.length === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  const filteredIds = filtered.map((a) => a.id);
  const selectedInFiltered = filteredIds.filter((id) => state.selectedIds.has(id)).length;
  const allSelected = selectedInFiltered === filteredIds.length;
  const partialSelected = selectedInFiltered > 0 && !allSelected;

  // -- Select-all checkbox (tri-state: empty / mixed / all)
  const selectAll = document.createElement('span');
  selectAll.className = 'admin-bulk-select-all';
  if (allSelected) {
    selectAll.classList.add('admin-bulk-select-all--checked');
  } else if (partialSelected) {
    selectAll.classList.add('admin-bulk-select-all--mixed');
  }
  selectAll.setAttribute('role', 'checkbox');
  selectAll.setAttribute(
    'aria-checked',
    allSelected ? 'true' : partialSelected ? 'mixed' : 'false'
  );
  selectAll.setAttribute('tabindex', '0');
  selectAll.setAttribute('aria-label', t('admin.bulk_select_all_label'));
  const toggleAll = (): void => {
    if (allSelected) {
      for (const id of filteredIds) {
        state.selectedIds.delete(id);
      }
    } else {
      for (const id of filteredIds) {
        state.selectedIds.add(id);
      }
    }
    rerender();
  };
  selectAll.addEventListener('click', toggleAll);
  selectAll.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleAll();
    }
  });
  bar.appendChild(selectAll);

  // -- Label: telling
  const label = document.createElement('span');
  label.className = 'admin-bulk-label';
  if (state.selectedIds.size === 0) {
    label.textContent = t('admin.bulk_select_all_hint').replace('{count}', String(filtered.length));
  } else {
    label.textContent = t('admin.bulk_selected_count').replace(
      '{n}',
      String(state.selectedIds.size)
    );
  }
  bar.appendChild(label);

  // -- Wis-selectie-knop (alleen als >0)
  if (state.selectedIds.size > 0) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'admin-bulk-clear';
    clear.textContent = t('admin.bulk_clear');
    clear.addEventListener('click', () => {
      state.selectedIds.clear();
      rerender();
    });
    bar.appendChild(clear);
  }

  // -- Verwijder-knop (rechts, danger-styling)
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'auth-submit auth-submit-danger admin-bulk-delete';
  del.textContent = t('admin.bulk_delete_button').replace('{n}', String(state.selectedIds.size));
  del.disabled = state.selectedIds.size === 0;
  del.addEventListener('click', () => {
    const selectedAuthors = state.authors.filter((a) => state.selectedIds.has(a.id));
    openBulkDeleteModal({
      authors: selectedAuthors,
      onComplete: (deletedIds) => {
        if (deletedIds.length === 0) {
          return;
        }
        // Filter verwijderde rijen uit state + selection
        const deletedSet = new Set(deletedIds);
        state.authors = state.authors.filter((a) => !deletedSet.has(a.id));
        for (const id of deletedIds) {
          state.selectedIds.delete(id);
        }
        showStatus(
          statusBox,
          'success',
          t('admin.bulk_delete_status_success').replace('{n}', String(deletedIds.length))
        );
        rerender();
      },
    });
  });
  bar.appendChild(del);
}

/** Vervang één auteur-rij in state na een actie, daarna re-render de lijst. */
function refreshOne(state: ListState, authorId: string, rerender: () => void): void {
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
      rerender();
    });
}

function renderAuthorCard(
  author: AuthorRow,
  state: ListState,
  onChanged: () => void,
  statusBox: HTMLElement,
  rerender: () => void
): HTMLElement {
  const hasPayments = state.paymentsByAuthor.has(author.id);
  const status = deriveAdminStatus(author, hasPayments);
  const isSelected = state.selectedIds.has(author.id);

  // Hele kaart is klikbaar — opent het detail-paneel. We gebruiken
  // `<button>` zodat tastatuur/screenreader-ondersteuning er gratis bij komt.
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `admin-author-card admin-author-card--${status}${isSelected ? ' admin-author-card--selected' : ''}`;
  card.setAttribute(
    'aria-label',
    `${author.first_name} ${author.last_name} — ${statusLabel(status)}`
  );

  // -- Checkbox links voor bulk-acties (verwijderen). Aparte <span> met
  // role=checkbox zodat we de native click niet door laten lekken naar de
  // card (die het detail-paneel zou openen).
  const checkbox = document.createElement('span');
  checkbox.className = 'admin-author-checkbox';
  checkbox.setAttribute('role', 'checkbox');
  checkbox.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  checkbox.setAttribute('tabindex', '0');
  checkbox.setAttribute(
    'aria-label',
    `${t('admin.bulk_select_label')} ${author.first_name} ${author.last_name}`
  );
  const toggleSelection = (): void => {
    if (state.selectedIds.has(author.id)) {
      state.selectedIds.delete(author.id);
    } else {
      state.selectedIds.add(author.id);
    }
    rerender();
  };
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelection();
  });
  checkbox.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      toggleSelection();
    }
  });
  card.appendChild(checkbox);

  // -- Avatar (initials in primary-cirkel)
  const avatar = document.createElement('span');
  avatar.className = 'admin-author-avatar';
  const initials =
    `${author.first_name.trim()[0] ?? ''}${author.last_name.trim()[0] ?? ''}`.toUpperCase();
  avatar.textContent = initials === '' ? '·' : initials;
  card.appendChild(avatar);

  // -- Hoofd-info-kolom (naam + meta)
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
  if (author.activated_at !== null) {
    parts.push(t('admin.activated_at').replace('{date}', formatShortDate(author.activated_at)));
  } else if (author.reminder_sent_at !== null) {
    parts.push(t('admin.reminder_at').replace('{date}', formatShortDate(author.reminder_sent_at)));
  } else if (author.invited_at !== null) {
    parts.push(t('admin.invited_at').replace('{date}', formatShortDate(author.invited_at)));
  } else {
    parts.push(t('admin.created_at').replace('{date}', formatShortDate(author.created_at)));
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  card.appendChild(main);

  // -- Status-pill rechts
  const right = document.createElement('div');
  right.className = 'admin-author-right';
  right.appendChild(buildStatusPill(author, status));
  card.appendChild(right);

  // -- Klik = open detail-paneel met passende acties voor deze status
  card.addEventListener('click', () => {
    openDetailFor(author, status, onChanged, statusBox);
  });

  return card;
}

interface DetailAction {
  label: string;
  tooltip?: string;
  onClick: () => void;
  /** Visuele variant — `danger` rendert als rode knop voor destructieve acties. */
  variant?: 'danger';
}

function statusLabel(status: AdminStatus): string {
  switch (status) {
    case 'persoonsgegevens':
      return t('admin.status_persoonsgegevens');
    case 'id_koppelen':
      return t('admin.status_id_koppelen');
    case 'statements':
      return t('admin.status_statements');
    case 'gereed':
      return t('admin.status_gereed');
    case 'actief':
      return t('admin.status_actief');
  }
}

/**
 * Opent het detail-paneel met status-afhankelijke primary action en de
 * vaste secundaire acties (Reset MFA, Contract uploaden).
 */
function openDetailFor(
  author: AuthorRow,
  status: AdminStatus,
  onChanged: () => void,
  statusBox: HTMLElement
): void {
  const statusPill = buildStatusPill(author, status);

  let primary: DetailAction | null = null;

  if (!author.is_admin) {
    if (status === 'persoonsgegevens') {
      primary = {
        label: t('admin.btn_send_reminder_label'),
        tooltip: t('admin.tooltip_send_reminder'),
        onClick: () => {
          void invokeCreateAccounts(author, 'invite', statusBox).then(onChanged);
        },
      };
    } else if (status === 'id_koppelen') {
      primary = {
        label: t('admin.btn_id_koppelen'),
        tooltip: t('admin.tooltip_id_koppelen'),
        onClick: () => {
          openIdKoppelModal(author, onChanged);
        },
      };
    } else if (status === 'gereed') {
      primary = {
        label: t('admin.btn_activate'),
        tooltip: t('admin.tooltip_activate'),
        onClick: () => {
          void invokeCreateAccounts(author, 'activate', statusBox).then(onChanged);
        },
      };
    }
  }

  const secondaries: DetailAction[] = [];
  if (!author.is_admin) {
    secondaries.push({
      label: t('admin.btn_upload_contract'),
      tooltip: t('admin.tooltip_upload_contract'),
      onClick: () => {
        openContractUploadModal(author, onChanged);
      },
    });
  }
  if (author.mfa_enrolled) {
    secondaries.push({
      label: t('admin.btn_reset_mfa'),
      tooltip: t('admin.tooltip_reset_mfa'),
      onClick: () => {
        void resetMfaForAuthor(author, statusBox).then(onChanged);
      },
    });
  }

  // Verwijder-actie altijd onderaan; geblokkeerd voor je eigen account
  // (Edge Function returnt extra 400 als sluitnet).
  secondaries.push({
    label: t('admin.btn_delete_author'),
    tooltip: t('admin.tooltip_delete_author'),
    variant: 'danger',
    onClick: () => {
      const fullName = `${author.first_name} ${author.last_name}`.trim();
      openConfirmModal({
        title: t('admin.delete_author_heading').replace('{name}', fullName),
        body: t('admin.delete_author_body'),
        confirmLabel: t('admin.delete_author_confirm'),
        danger: true,
        onConfirm: async () => {
          await deleteAuthor(author.id);
          showStatus(
            statusBox,
            'success',
            t('admin.delete_author_success').replace('{name}', fullName)
          );
          onChanged();
        },
      });
    },
  });

  openAuthorDetailPanel({
    author,
    statusPill,
    primaryAction: primary,
    secondaryActions: secondaries,
    onClose: () => {
      // Geen extra werk — onChanged wordt al gevoerd door de individuele actie-handlers.
    },
  });
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
    case 'id_koppelen':
      pill.textContent = t('admin.status_id_koppelen');
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
const ICON_UPLOAD =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

/** Grotere variant van ICON_UPLOAD zonder hardcoded width/height; door
 *  CSS gestyled in `.admin-action-card-icon svg`. */
const ICON_UPLOAD_BIG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';

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

/** Skeleton-versie van een author-card: dezelfde layout maar grijze blokken
 *  i.p.v. echte content. Voorkomt layout-shift wanneer de echte cards
 *  binnenkomen. */
function buildSkeletonCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'admin-author-card admin-author-card--skeleton';
  card.setAttribute('aria-hidden', 'true');

  const avatar = document.createElement('span');
  avatar.className = 'admin-author-avatar skeleton-block skeleton-block--circle';
  card.appendChild(avatar);

  const main = document.createElement('div');
  main.className = 'admin-author-main';
  const name = document.createElement('span');
  name.className = 'skeleton-block skeleton-block--name';
  main.appendChild(name);
  const meta = document.createElement('span');
  meta.className = 'skeleton-block skeleton-block--meta';
  main.appendChild(meta);
  card.appendChild(main);

  const right = document.createElement('div');
  right.className = 'admin-author-right';
  const pill = document.createElement('span');
  pill.className = 'skeleton-block skeleton-block--pill';
  right.appendChild(pill);
  card.appendChild(right);

  return card;
}

/** Vriendelijke onboarding-state voor wanneer er nog 0 niet-admin auteurs
 *  in het systeem zitten. Inviting copy + visuele hint dat de acties
 *  onderaan staan. */
function buildZeroAuthorsState(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'admin-empty-zero';

  const icon = document.createElement('div');
  icon.className = 'admin-empty-zero-icon';
  icon.innerHTML =
    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';
  wrap.appendChild(icon);

  const title = document.createElement('h3');
  title.className = 'admin-empty-zero-title';
  title.textContent = t('admin.empty_zero_title');
  wrap.appendChild(title);

  const intro = document.createElement('p');
  intro.className = 'admin-empty-zero-intro';
  intro.textContent = t('admin.empty_zero_intro');
  wrap.appendChild(intro);

  return wrap;
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear())}`;
}
