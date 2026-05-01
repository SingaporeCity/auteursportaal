/**
 * Afrekeningen-tab — lijst eigen payments met type-filter pills + zoek.
 *
 * Designtaal van demo: type-pills met gekleurde dot, zoekbalk met clear-knop,
 * year-headers tussen jaren (alleen als filter "Alle"), gradient-icon-circles
 * per type, signed-URL download in nieuwe tab.
 *
 * @module views/tabs/payments
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import type { Database, PaymentType } from '@/types/db';

type PaymentRow = Database['public']['Tables']['payments']['Row'];

const TYPE_LABEL: Record<PaymentType, string> = {
  royalty: 'Royalty-afrekening',
  subsidiary: 'Nevenrechten',
  foreign: 'Foreign Rights',
  jaaropgave: 'Jaaropgave',
};

const TYPE_INITIALS: Record<PaymentType, string> = {
  royalty: 'R',
  subsidiary: 'N',
  foreign: 'FR',
  jaaropgave: 'J',
};

const TYPE_COLOR: Record<PaymentType, string> = {
  royalty: 'var(--color-primary)',
  subsidiary: 'var(--color-accent-blue)',
  foreign: 'var(--color-accent-coral)',
  jaaropgave: 'var(--color-accent-purple)',
};

type TypeFilter = 'all' | PaymentType;

interface State {
  payments: PaymentRow[];
  search: string;
  typeFilter: TypeFilter;
}

export function renderPaymentsTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = 'Royalty-afrekeningen';
  container.appendChild(heading);

  const state: State = { payments: [], search: '', typeFilter: 'all' };

  const toolbar = document.createElement('div');
  toolbar.className = 'payments-toolbar';
  container.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'payments-list';
  list.textContent = 'Laden…';
  container.appendChild(list);

  const repaint = (): void => {
    renderToolbar(toolbar, state, () => {
      repaint();
    });
    renderList(list, state);
  };

  void load(state, repaint);
}

async function load(state: State, repaint: () => void): Promise<void> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('year', { ascending: false })
    .order('payment_date', { ascending: false });

  if (error !== null) {
    reportError('payments.load', error);
    state.payments = [];
  } else {
    state.payments = data;
  }
  repaint();
}

function renderToolbar(container: HTMLElement, state: State, repaint: () => void): void {
  container.replaceChildren();

  // Zoekbalk
  const searchWrap = document.createElement('div');
  searchWrap.className = 'payments-search';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'payments-search-icon';
  searchIcon.textContent = '🔎';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchWrap.appendChild(searchIcon);

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Zoek op titel, datum of bedrag…';
  searchInput.value = state.search;
  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    repaint();
  });
  searchWrap.appendChild(searchInput);

  if (state.search.length > 0) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'payments-search-clear';
    clear.textContent = '×';
    clear.setAttribute('aria-label', 'Zoekterm wissen');
    clear.addEventListener('click', () => {
      state.search = '';
      repaint();
    });
    searchWrap.appendChild(clear);
  }
  container.appendChild(searchWrap);

  // Type filter pills
  const filters = document.createElement('div');
  filters.className = 'payments-type-filter';

  const opts: { id: TypeFilter; label: string; color?: string }[] = [
    { id: 'all', label: 'Alle' },
    { id: 'royalty', label: 'Royalties', color: TYPE_COLOR.royalty },
    { id: 'subsidiary', label: 'Nevenrechten', color: TYPE_COLOR.subsidiary },
    { id: 'foreign', label: 'Foreign Rights', color: TYPE_COLOR.foreign },
    { id: 'jaaropgave', label: 'Jaaropgaves', color: TYPE_COLOR.jaaropgave },
  ];

  for (const opt of opts) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'payments-pill';
    if (state.typeFilter === opt.id) {
      pill.classList.add('active');
    }
    if (opt.color !== undefined) {
      const dot = document.createElement('span');
      dot.className = 'payments-pill-dot';
      dot.style.background = opt.color;
      pill.appendChild(dot);
    }
    const label = document.createElement('span');
    label.textContent = opt.label;
    pill.appendChild(label);
    pill.addEventListener('click', () => {
      state.typeFilter = opt.id;
      repaint();
    });
    filters.appendChild(pill);
  }
  container.appendChild(filters);
}

function renderList(container: HTMLElement, state: State): void {
  container.replaceChildren();

  const filtered = state.payments.filter((p) => {
    if (state.typeFilter !== 'all' && p.type !== state.typeFilter) {
      return false;
    }
    if (state.search.length > 0) {
      const haystack = [
        p.title_nl ?? '',
        TYPE_LABEL[p.type],
        p.payment_date ?? '',
        String(p.year),
        String(p.amount),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(state.search)) {
        return false;
      }
    }
    return true;
  });

  // Result count
  const count = document.createElement('div');
  count.className = 'payments-result-count';
  if (filtered.length === state.payments.length) {
    count.textContent = `${String(state.payments.length)} afrekeningen`;
  } else {
    count.textContent = `${String(filtered.length)} van ${String(state.payments.length)} afrekeningen`;
  }
  container.appendChild(count);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'payments-empty';
    empty.textContent =
      state.payments.length === 0
        ? 'Geen afrekeningen beschikbaar.'
        : 'Geen afrekeningen die voldoen aan de filter.';
    container.appendChild(empty);
    return;
  }

  // Year-headers alleen als filter "Alle" is
  const showYearHeaders = state.typeFilter === 'all' && state.search.length === 0;
  const byYear = groupByYear(filtered);

  for (const [year, items] of byYear) {
    if (showYearHeaders) {
      const yearHeader = document.createElement('h3');
      yearHeader.className = 'payments-year-header';
      yearHeader.textContent = String(year);
      container.appendChild(yearHeader);
    }
    items.forEach((p) => container.appendChild(renderPaymentRow(p)));
  }
}

function renderPaymentRow(payment: PaymentRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'payment-row';
  if (payment.type === 'jaaropgave') {
    row.classList.add('payment-row-jaaropgave');
  }

  const icon = document.createElement('div');
  icon.className = `payment-icon payment-icon-${payment.type}`;
  icon.textContent = TYPE_INITIALS[payment.type];
  row.appendChild(icon);

  const main = document.createElement('div');
  main.className = 'payment-main';

  const typeLabel = TYPE_LABEL[payment.type];
  const title = document.createElement('div');
  title.className = 'payment-title';
  title.textContent = payment.title_nl ?? typeLabel;
  main.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'payment-meta';
  const parts: string[] = [typeLabel];
  if (payment.payment_date !== null) {
    parts.push(formatDate(payment.payment_date));
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  row.appendChild(main);

  const amount = document.createElement('div');
  amount.className = 'payment-amount';
  amount.textContent = payment.amount > 0 ? formatCurrency(payment.amount) : '—';
  row.appendChild(amount);

  if (payment.file_path !== null) {
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'payment-download';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => {
      void download(payment, downloadBtn);
    });
    row.appendChild(downloadBtn);
  } else {
    const missing = document.createElement('span');
    missing.className = 'payment-missing';
    missing.textContent = 'PDF ontbreekt';
    row.appendChild(missing);
  }

  return row;
}

async function download(payment: PaymentRow, btn: HTMLButtonElement): Promise<void> {
  if (payment.file_path === null) {
    return;
  }
  btn.disabled = true;
  btn.textContent = '…';

  const { data, error } = await supabase.storage
    .from('statements')
    .createSignedUrl(payment.file_path, 60);

  btn.disabled = false;
  btn.textContent = 'Download';

  if (error !== null) {
    reportError('payments.download', error);
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

function groupByYear(payments: PaymentRow[]): Map<number, PaymentRow[]> {
  const map = new Map<number, PaymentRow[]>();
  for (const p of payments) {
    const list = map.get(p.year) ?? [];
    list.push(p);
    map.set(p.year, list);
  }
  return map;
}
