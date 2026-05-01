/**
 * Mobile-tab-toggle — chevron-knop boven de tabs-nav voor smalle schermen.
 *
 * Op ≤768px wordt de horizontale tabs-nav verborgen en deze toggle zichtbaar.
 * Klik opent een verticale dropdown (`tabs-nav.mobile-open`) met dezelfde tabs.
 * Bij keuze sluit het menu automatisch en update het toggle-label.
 *
 * Op desktop (>768px) is de toggle volledig verborgen via CSS.
 *
 * @module views/shared/mobile-tabs
 */

interface MobileTabsHandle {
  /** Container element met `.mobile-tab-toggle` class. */
  toggle: HTMLButtonElement;
  /** Update label-tekst (bijv. na tab-switch). */
  setLabel: (text: string) => void;
  /** Sluit het dropdown-menu. */
  close: () => void;
}

export function buildMobileTabToggle(tabsNav: HTMLElement, initialLabel: string): MobileTabsHandle {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-tab-toggle';
  toggle.setAttribute('aria-expanded', 'false');

  const labelEl = document.createElement('span');
  labelEl.className = 'mobile-tab-toggle-label';
  labelEl.textContent = initialLabel;
  toggle.appendChild(labelEl);

  const chevron = document.createElement('span');
  chevron.className = 'mobile-tab-toggle-chevron';
  chevron.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  toggle.appendChild(chevron);

  const close = (): void => {
    tabsNav.classList.remove('mobile-open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const open = (): void => {
    tabsNav.classList.add('mobile-open');
    toggle.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', () => {
    if (tabsNav.classList.contains('mobile-open')) {
      close();
    } else {
      open();
    }
  });

  // Klik buiten sluit menu
  document.addEventListener('click', (e) => {
    if (!toggle.classList.contains('open')) {
      return;
    }
    const target = e.target as Node;
    if (toggle.contains(target) || tabsNav.contains(target)) {
      return;
    }
    close();
  });

  return {
    toggle,
    setLabel: (text: string) => {
      labelEl.textContent = text;
    },
    close,
  };
}
