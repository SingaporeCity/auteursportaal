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
import { signOut } from '@/auth';
import { renderProfileTab } from './tabs/profile';
import { renderPaymentsTab } from './tabs/payments';
import { t } from '@/lib/i18n';

type TabId = 'start' | 'payments' | 'contracts' | 'forecast' | 'expenses' | 'faq' | 'profile';

const TABS: readonly { id: TabId; labelKey: Parameters<typeof t>[0]; mvp: boolean }[] = [
  { id: 'start', labelKey: 'tabs.start', mvp: false },
  { id: 'payments', labelKey: 'tabs.payments', mvp: true },
  { id: 'contracts', labelKey: 'tabs.contracts', mvp: false },
  { id: 'forecast', labelKey: 'tabs.forecast', mvp: false },
  { id: 'expenses', labelKey: 'tabs.expenses', mvp: false },
  { id: 'faq', labelKey: 'tabs.faq', mvp: false },
  { id: 'profile', labelKey: 'tabs.profile', mvp: true },
];

export function renderDashboardView(root: HTMLElement, author: AuthorRow): void {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'app-shell';

  layout.appendChild(buildHeader(author));

  const tabsNav = document.createElement('nav');
  tabsNav.className = 'tabs-nav';
  layout.appendChild(tabsNav);

  const content = document.createElement('main');
  content.className = 'tab-content';
  layout.appendChild(content);

  root.appendChild(layout);

  let activeTab: TabId = 'profile';

  function switchTab(target: TabId): void {
    activeTab = target;
    [...tabsNav.children].forEach((node) => {
      const btn = node as HTMLButtonElement;
      btn.classList.toggle('active', btn.dataset['tab'] === target);
    });
    renderTabContent(content, target, author);
  }

  TABS.forEach(({ id, labelKey, mvp }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.dataset['tab'] = id;
    btn.textContent = t(labelKey);
    if (!mvp) {
      btn.classList.add('tab-soon');
      btn.title = 'Komt in volgende iteratie';
    }
    btn.addEventListener('click', () => {
      switchTab(id);
    });
    tabsNav.appendChild(btn);
  });

  switchTab(activeTab);
}

function buildHeader(author: AuthorRow): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';

  const title = document.createElement('div');
  title.className = 'app-header-title';
  title.textContent = `${t('app.title')} · ${author.first_name} ${author.last_name}`;
  header.appendChild(title);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'app-header-logout';
  logoutBtn.textContent = t('auth.logout');
  logoutBtn.addEventListener('click', () => {
    void signOut();
  });
  header.appendChild(logoutBtn);

  return header;
}

function renderTabContent(container: HTMLElement, tab: TabId, author: AuthorRow): void {
  container.replaceChildren();

  if (tab === 'profile') {
    renderProfileTab(container, author);
    return;
  }
  if (tab === 'payments') {
    renderPaymentsTab(container);
    return;
  }

  const placeholder = document.createElement('div');
  placeholder.className = 'tab-placeholder';
  placeholder.textContent = `Tabblad "${t(`tabs.${tab}`)}" wordt in een volgende iteratie geport.`;
  container.appendChild(placeholder);
}
