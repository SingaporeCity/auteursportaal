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
import { openPdfPreview } from '@/views/shared/pdf-preview';
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

  // Year-headers per UITBETAALJAAR (year of payment_date)
  const showYearHeaders = state.typeFilter === 'all' && state.search.length === 0;
  const byPaidYear = groupByPaidYear(filtered);

  for (const [year, items] of byPaidYear) {
    if (showYearHeaders) {
      const yearHeader = document.createElement('h3');
      yearHeader.className = 'payments-year-header';
      yearHeader.textContent = `Uitgekeerd in ${String(year)}`;
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
    const actions = document.createElement('div');
    actions.className = 'payment-actions';

    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'payment-action-btn payment-preview';
    previewBtn.title = 'Bekijken';
    previewBtn.setAttribute('aria-label', 'PDF bekijken');
    previewBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
    previewBtn.addEventListener('click', () => {
      const filePath = payment.file_path;
      if (filePath === null) {
        return;
      }
      void openPdfPreview({
        filePath,
        title: payment.title_nl ?? TYPE_LABEL[payment.type],
        subtitle: payment.payment_date !== null ? formatDate(payment.payment_date) : undefined,
      });
    });
    actions.appendChild(previewBtn);

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'payment-action-btn payment-download-icon';
    downloadBtn.title = 'Downloaden';
    downloadBtn.setAttribute('aria-label', 'PDF downloaden');
    downloadBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    downloadBtn.addEventListener('click', () => {
      void download(payment, downloadBtn);
    });
    actions.appendChild(downloadBtn);

    row.appendChild(actions);
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

  const { data, error } = await supabase.storage
    .from('statements')
    .createSignedUrl(payment.file_path, 60);

  btn.disabled = false;

  if (error !== null) {
    reportError('payments.download', error);
    return;
  }

  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

function groupByPaidYear(payments: PaymentRow[]): Map<number, PaymentRow[]> {
  const map = new Map<number, PaymentRow[]>();
  for (const p of payments) {
    const py = p.payment_date !== null ? new Date(p.payment_date).getFullYear() : p.year;
    const list = map.get(py) ?? [];
    list.push(p);
    map.set(py, list);
  }
  // Sorteer aflopend: nieuwste uitbetaaljaar eerst
  return new Map([...map.entries()].sort((a, b) => b[0] - a[0]));
}
