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
import { renderProfileTab } from './tabs/profile';
import { renderPaymentsTab } from './tabs/payments';
import { renderStartTab } from './tabs/start';
import { renderContractsTab } from './tabs/contracts';
import { renderForecastTab } from './tabs/forecast';
import { renderExpensesTab } from './tabs/expenses';
import { renderFaqTab } from './tabs/faq';
import { t } from '@/lib/i18n';
import { buildAppHeader } from './shared/header';

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

  layout.appendChild(buildAppHeader(`${author.first_name} ${author.last_name}`));

  const tabsNav = document.createElement('nav');
  tabsNav.className = 'tabs-nav';
  layout.appendChild(tabsNav);

  const content = document.createElement('main');
  content.className = 'tab-content';
  layout.appendChild(content);

  root.appendChild(layout);

  let activeTab: TabId = 'start';

  function switchTab(target: TabId): void {
    activeTab = target;
    [...tabsNav.children].forEach((node) => {
      const btn = node as HTMLButtonElement;
      btn.classList.toggle('active', btn.dataset['tab'] === target);
    });
    renderTabContent(content, target, author);
  }

  TABS.forEach(({ id, labelKey }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset['tab'] = id;
    btn.textContent = t(labelKey);
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
      renderStartTab(container, author);
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
