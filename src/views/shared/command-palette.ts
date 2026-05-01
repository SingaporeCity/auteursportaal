/**
 * Command Palette (⌘K / Ctrl+K) — fullscreen modal-overlay met cross-tab search.
 *
 * Zoekt over:
 *   - Tab-namen (navigeer direct naar tab)
 *   - Payment-titels (open de afrekeningen-tab + scroll naar item)
 *   - Contract-namen + nummers
 *   - FAQ-vragen (open FAQ-tab + scroll naar vraag)
 *
 * Keyboard: ↑/↓ navigeren, Enter activeert, Esc sluit.
 *
 * @module views/shared/command-palette
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { FAQ_ITEMS } from '@/views/tabs/faq-data';
import { t } from '@/lib/i18n';

interface CommandItem {
  group: string;
  label: string;
  hint?: string;
  action: () => void;
}

let isOpen = false;

export function openCommandPalette(): void {
  if (isOpen) {
    return;
  }
  isOpen = true;

  const overlay = document.createElement('div');
  overlay.className = 'cmd-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  const modal = document.createElement('div');
  modal.className = 'cmd-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  const inputWrap = document.createElement('div');
  inputWrap.className = 'cmd-input-wrap';

  const icon = document.createElement('span');
  icon.className = 'cmd-input-icon';
  icon.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  inputWrap.appendChild(icon);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cmd-input';
  input.placeholder = t('cmd.placeholder');
  input.autocomplete = 'off';
  input.spellcheck = false;
  inputWrap.appendChild(input);

  const escBadge = document.createElement('kbd');
  escBadge.className = 'cmd-esc-kbd';
  escBadge.textContent = 'Esc';
  inputWrap.appendChild(escBadge);

  modal.appendChild(inputWrap);

  const results = document.createElement('div');
  results.className = 'cmd-results';
  modal.appendChild(results);

  // -- State
  let allCommands: CommandItem[] = baseCommands();
  let filtered: CommandItem[] = allCommands;
  let activeIdx = 0;

  // Async aanvullen met DB-data
  void loadDatabaseCommands().then((extra) => {
    allCommands = [...baseCommands(), ...extra];
    paint();
    return undefined;
  });

  const close = (): void => {
    isOpen = false;
    overlay.remove();
    document.removeEventListener('keydown', keyHandler);
    document.body.style.overflow = '';
  };

  const paint = (): void => {
    filtered = filterCommands(allCommands, input.value.trim().toLowerCase());
    activeIdx = 0;
    renderResults(results, filtered, activeIdx, close);
  };

  const keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(filtered.length - 1, activeIdx + 1);
      renderResults(results, filtered, activeIdx, close);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      renderResults(results, filtered, activeIdx, close);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item !== undefined) {
        close();
        item.action();
      }
    }
  };

  input.addEventListener('input', paint);
  document.addEventListener('keydown', keyHandler);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  paint();
  setTimeout(() => {
    input.focus();
  }, 50);
}

// Mondiaal: Ctrl/Cmd+K opent palette
export function registerGlobalCmdKShortcut(): void {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  });
}

function baseCommands(): CommandItem[] {
  const tabs: { id: string; key: Parameters<typeof t>[0] }[] = [
    { id: 'start', key: 'tabs.start' },
    { id: 'payments', key: 'tabs.payments' },
    { id: 'contracts', key: 'tabs.contracts' },
    { id: 'forecast', key: 'tabs.forecast' },
    { id: 'expenses', key: 'tabs.expenses' },
    { id: 'faq', key: 'tabs.faq' },
    { id: 'profile', key: 'tabs.profile' },
  ];

  return tabs.map((tab) => ({
    group: t('cmd.group_navigation'),
    label: t(tab.key),
    hint: t('cmd.hint_open_tab'),
    action: () => {
      const btn = document.querySelector<HTMLButtonElement>(`button.tab-btn[data-tab="${tab.id}"]`);
      btn?.click();
    },
  }));
}

async function loadDatabaseCommands(): Promise<CommandItem[]> {
  const out: CommandItem[] = [];

  // Payments
  const { data: payments, error: pErr } = await supabase
    .from('payments')
    .select('title_nl, type, year, payment_date')
    .order('payment_date', { ascending: false });
  if (pErr === null) {
    payments.forEach((p) => {
      out.push({
        group: t('cmd.group_payments'),
        label: p.title_nl ?? `${p.type} ${String(p.year)}`,
        hint: p.payment_date ?? '',
        action: () => {
          document.querySelector<HTMLButtonElement>('button.tab-btn[data-tab="payments"]')?.click();
        },
      });
    });
  } else {
    reportError('cmd.payments', pErr);
  }

  // Contracts
  const { data: contracts, error: cErr } = await supabase
    .from('contracts')
    .select('contract_name, contract_number');
  if (cErr === null) {
    contracts.forEach((c) => {
      out.push({
        group: t('cmd.group_contracts'),
        label: c.contract_name ?? c.contract_number,
        hint: c.contract_number,
        action: () => {
          document
            .querySelector<HTMLButtonElement>('button.tab-btn[data-tab="contracts"]')
            ?.click();
        },
      });
    });
  } else {
    reportError('cmd.contracts', cErr);
  }

  // FAQ
  FAQ_ITEMS.forEach((item) => {
    out.push({
      group: t('cmd.group_faq'),
      label: item.question,
      action: () => {
        document.querySelector<HTMLButtonElement>('button.tab-btn[data-tab="faq"]')?.click();
      },
    });
  });

  return out;
}

function filterCommands(all: CommandItem[], query: string): CommandItem[] {
  if (query.length === 0) {
    return all;
  }
  return all.filter((item) => {
    const haystack = `${item.label} ${item.hint ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

function renderResults(
  container: HTMLElement,
  items: CommandItem[],
  activeIdx: number,
  close: () => void
): void {
  container.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cmd-empty';
    empty.textContent = t('cmd.no_results');
    container.appendChild(empty);
    return;
  }

  const grouped = new Map<string, CommandItem[]>();
  for (const item of items) {
    const list = grouped.get(item.group) ?? [];
    list.push(item);
    grouped.set(item.group, list);
  }

  let globalIdx = 0;
  for (const [group, list] of grouped) {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'cmd-group-header';
    groupHeader.textContent = group;
    container.appendChild(groupHeader);

    list.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cmd-row';
      if (globalIdx === activeIdx) {
        row.classList.add('active');
      }

      const labelEl = document.createElement('span');
      labelEl.className = 'cmd-row-label';
      labelEl.textContent = item.label;
      row.appendChild(labelEl);

      if (item.hint !== undefined && item.hint.length > 0) {
        const hintEl = document.createElement('span');
        hintEl.className = 'cmd-row-hint';
        hintEl.textContent = item.hint;
        row.appendChild(hintEl);
      }

      row.addEventListener('click', () => {
        close();
        item.action();
      });

      container.appendChild(row);
      globalIdx++;
    });
  }
}
