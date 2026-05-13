/**
 * Auteur-dashboard skelet — header + welcome + tabs-nav + content area.
 *
 * Dual-mode (vanaf iter 4):
 *  - `mode: 'full'` — alle 7 tabs actief, normale flow.
 *  - `mode: 'onboarding'` — alleen profile-tab actief, andere tabs disabled met
 *    tooltip; banner bovenaan toont status (pending_data of pending_admin_review).
 *    Auteur kan in profile-tab zijn data aanvullen + activatie aanvragen.
 *
 * @module views/dashboard
 */

import type { AuthorRow } from '@/auth';
import type { AccessMode } from '@/auth/whitelist';
import { buildWelcomeSection } from './shared/welcome-section';
import { registerGlobalCmdKShortcut } from './shared/command-palette';
import { buildMobileTabToggle } from './shared/mobile-tabs';
import { buildOnboardingBanner } from './shared/onboarding-banner';
import { buildOnboardingProgress } from './shared/onboarding-progress';
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

export function renderDashboardView(
  root: HTMLElement,
  author: AuthorRow,
  mode: AccessMode = 'full'
): void {
  root.replaceChildren();

  const isOnboarding = mode === 'onboarding';
  const initialTab: TabId = isOnboarding ? 'profile' : 'start';

  const layout = document.createElement('div');
  layout.className = 'app-shell';

  layout.appendChild(buildAppHeader());

  const dashContent = document.createElement('div');
  dashContent.className = 'dashboard-content';
  layout.appendChild(dashContent);

  // Welcome section staat boven de tabs (greeting + tagline)
  dashContent.appendChild(buildWelcomeSection(author));

  // Onboarding-banner + progress-indicator direct onder de welcome bij niet-active auteurs
  if (isOnboarding) {
    const banner = buildOnboardingBanner(author);
    if (banner !== null) {
      dashContent.appendChild(banner);
    }
    const progress = buildOnboardingProgress(author.onboarding_status);
    if (progress !== null) {
      dashContent.appendChild(progress);
    }
  }

  const tabsContainer = document.createElement('section');
  tabsContainer.className = 'tabs-container';
  dashContent.appendChild(tabsContainer);

  // Command-palette is alleen zinvol in full-mode (zoekt over payments/contracts)
  if (!isOnboarding) {
    registerGlobalCmdKShortcut();
  }

  const tabsNav = document.createElement('nav');
  tabsNav.className = 'tabs-nav';

  const initialTabConfig = TABS.find((tab) => tab.id === initialTab);
  const initialLabel = initialTabConfig !== undefined ? t(initialTabConfig.labelKey) : '';
  const mobileToggleHandle = buildMobileTabToggle(tabsNav, initialLabel);
  tabsContainer.appendChild(mobileToggleHandle.toggle);
  tabsContainer.appendChild(tabsNav);

  const content = document.createElement('main');
  content.className = 'tab-content';
  tabsContainer.appendChild(content);

  root.appendChild(layout);

  let activeTab: TabId = initialTab;

  function switchTab(target: TabId): void {
    // In onboarding-mode: alleen 'profile' is klikbaar; negeer andere clicks
    if (isOnboarding && target !== 'profile') {
      return;
    }
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

    const isLocked = isOnboarding && id !== 'profile';
    if (isLocked) {
      btn.classList.add('tab-btn-locked');
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.title = t('onboarding.tab_disabled_tooltip');
    }

    const iconWrap = document.createElement('span');
    iconWrap.className = 'tab-icon';
    // SVG-strings uit eigen module — niet gebruiker-gegenereerd
    // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
    iconWrap.innerHTML = TAB_ICONS[id satisfies TabIconId];
    btn.appendChild(iconWrap);

    const label = document.createElement('span');
    label.textContent = t(labelKey);
    btn.appendChild(label);

    if (isLocked) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'tab-btn-lock-icon';
      lockIcon.setAttribute('aria-hidden', 'true');
      lockIcon.textContent = '🔒';
      btn.appendChild(lockIcon);
    }

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
