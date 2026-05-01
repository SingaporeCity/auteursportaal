/**
 * SVG iconen voor de dashboard-tabs (overgenomen uit demo).
 * Worden getekend met `currentColor` zodat ze meekleuren met de active state.
 *
 * @module views/shared/tab-icons
 */

export type TabIconId =
  | 'start'
  | 'payments'
  | 'contracts'
  | 'forecast'
  | 'expenses'
  | 'faq'
  | 'profile';

export const TAB_ICONS: Record<TabIconId, string> = {
  start: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.71 2.29a1 1 0 00-1.42 0l-9 9a1 1 0 00.33 1.64A1 1 0 003 13h1v7a2 2 0 002 2h4v-5a1 1 0 011-1h2a1 1 0 011 1v5h4a2 2 0 002-2v-7h1a1 1 0 00.71-1.71z" fill="currentColor" opacity="0.15"/>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 22V12h6v10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  payments: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" fill="currentColor" opacity="0.1"/>
    <rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="16" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  contracts: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="currentColor" opacity="0.1"/>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M9 15l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  forecast: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" opacity="0.1"/>
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <polyline points="7 14 10 10 13 13 17 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="14 8 17 8 17 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  expenses: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 2h6l2 3h4a1 1 0 011 1v13a2 2 0 01-2 2H4a2 2 0 01-2-2V6a1 1 0 011-1h4z" fill="currentColor" opacity="0.1"/>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9" y1="14" x2="15" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  faq: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.1"/>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="1"/>
  </svg>`,
  profile: `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" opacity="0.1"/>
    <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="12" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <path d="M7 20c0-2.76 2.24-5 5-5s5 2.24 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
};
