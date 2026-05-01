/**
 * Auteur-dashboard skelet — header + tabs-nav + content area.
 *
 * MVP-versie: tabs Profiel + Afrekeningen werken. Contracten / Prognose /
 * Declaraties / FAQ tonen een "binnenkort"-state. Volledige port van die
 * tabs is gepland in een latere iteratie (zie TaskList #13).
 *
 * @module views/dashboard
 */

import type { AuthorRow } from '@/auth';
import { buildWelcomeSection } from './shared/welcome-section';
import { registerGlobalCmdKShortcut } from './shared/command-palette';
import { buildMobileTabToggle } from './shared/mobile-tabs';
import { renderProfileTab } from './tabs/profile';
import { renderPaymentsTab } from './tabs/payments';
import { renderStartTab } from './tabs/start';
import { renderContractsTab } from './tabs/contracts';
import { renderForecastTab } from './tabs/forecast';
import { renderExpensesTab } from './tabs/expenses';
import { renderFaqTab } from './tabs/faq';
import { t } from '@/lib/i18n';
import { buildAppHeader } from './shared/header';
import { TAB_ICONS, type TabIconId } from './shared/tab-icons';

type TabId = 'start' | 'payments' | 'contracts' | 'forecast' | 'expenses' | 'faq' | 'profile';

const TABS: readonly { id: TabId; labelKey: Parameters<typeof t>[0] }[] = [
  { id: 'start', labelKey: 'tabs.start' },
  { id: 'payments', labelKey: 'tabs.payments' },
  { id: 'contracts', labelKey: 'tabs.contracts' },
  { id: 'forecast', labelKey: 'tabs.forecast' },
  { id: 'expenses', labelKey: 'tabs.expenses' },
  { id: 'faq', labelKey: 'tabs.faq' },
  { id: 'profile', labelKey: 'tabs.profile' },
];

export function renderDashboardView(root: HTMLElement, author: AuthorRow): void {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'app-shell';

  layout.appendChild(buildAppHeader());

  const dashContent = document.createElement('div');
  dashContent.className = 'dashboard-content';
  layout.appendChild(dashContent);

  // Welcome section staat boven de tabs (greeting + tagline)
  dashContent.appendChild(buildWelcomeSection(author));

  const tabsContainer = document.createElement('section');
  tabsContainer.className = 'tabs-container';
  dashContent.appendChild(tabsContainer);

  registerGlobalCmdKShortcut();

  const tabsNav = document.createElement('nav');
  tabsNav.className = 'tabs-nav';

  const firstTab = TABS[0];
  const initialLabel = firstTab !== undefined ? t(firstTab.labelKey) : '';
  const mobileToggleHandle = buildMobileTabToggle(tabsNav, initialLabel);
  tabsContainer.appendChild(mobileToggleHandle.toggle);
  tabsContainer.appendChild(tabsNav);

  const content = document.createElement('main');
  content.className = 'tab-content';
  tabsContainer.appendChild(content);

  root.appendChild(layout);

  let activeTab: TabId = 'start';

  function switchTab(target: TabId): void {
    activeTab = target;
    [...tabsNav.children].forEach((node) => {
      const btn = node as HTMLButtonElement;
      btn.classList.toggle('active', btn.dataset['tab'] === target);
    });
    const targetTab = TABS.find((tab) => tab.id === target);
    if (targetTab !== undefined) {
      mobileToggleHandle.setLabel(t(targetTab.labelKey));
    }
    mobileToggleHandle.close();
    renderTabContent(content, target, author);
  }

  TABS.forEach(({ id, labelKey }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset['tab'] = id;

    const iconWrap = document.createElement('span');
    iconWrap.className = 'tab-icon';
    // SVG-strings uit eigen module — niet gebruiker-gegenereerd
    // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
    iconWrap.innerHTML = TAB_ICONS[id satisfies TabIconId];
    btn.appendChild(iconWrap);

    const label = document.createElement('span');
    label.textContent = t(labelKey);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      switchTab(id);
    });
    tabsNav.appendChild(btn);
  });

  switchTab(activeTab);
}

function renderTabContent(container: HTMLElement, tab: TabId, author: AuthorRow): void {
  container.replaceChildren();

  switch (tab) {
    case 'start':
      renderStartTab(container);
      return;
    case 'payments':
      renderPaymentsTab(container);
      return;
    case 'contracts':
      renderContractsTab(container);
      return;
    case 'forecast':
      renderForecastTab(container);
      return;
    case 'expenses':
      renderExpensesTab(container, author);
      return;
    case 'faq':
      renderFaqTab(container);
      return;
    case 'profile':
      renderProfileTab(container, author);
      return;
  }
}
