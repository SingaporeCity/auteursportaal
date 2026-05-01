/**
 * Contracten-tab — stats tegels + zoekbalk + contract cards.
 *
 * Demo design: 3 stats bovenaan (aantal contracten / gem. royalty% /
 * eerste contract), zoek-veld, daaronder cards met preview + download knoppen.
 *
 * @module views/tabs/contracts
 */

import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database } from '@/types/db';

type ContractRow = Database['public']['Tables']['contracts']['Row'];

interface State {
  contracts: ContractRow[];
  search: string;
}

export function renderContractsTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('contracts.title');
  container.appendChild(heading);

  const state: State = { contracts: [], search: '' };

  const statsRow = document.createElement('div');
  statsRow.className = 'contracts-stats';
  container.appendChild(statsRow);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'payments-search';
  container.appendChild(searchWrap);

  const list = document.createElement('div');
  list.className = 'contracts-list';
  list.textContent = 'Laden…';
  container.appendChild(list);

  const contact = document.createElement('p');
  contact.className = 'contracts-contact';
  contact.textContent = t('contracts.contact_text');
  container.appendChild(contact);

  const repaint = (): void => {
    renderStats(statsRow, state.contracts);
    renderSearch(searchWrap, state, repaint);
    renderList(list, state);
  };

  void load(state, repaint);
}

async function load(state: State, repaint: () => void): Promise<void> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('start_date', { ascending: false });

  if (error !== null) {
    reportError('contracts.load', error);
    state.contracts = [];
  } else {
    state.contracts = data;
  }
  repaint();
}

function renderStats(container: HTMLElement, contracts: ContractRow[]): void {
  container.replaceChildren();
  // Alleen 'Actieve contracten' tegel — Gem. royalty + Eerste contract weg
  container.appendChild(buildStat('Actieve contracten', String(contracts.length)));
}

function buildStat(label: string, value: string): HTMLElement {
  const stat = document.createElement('div');
  stat.className = 'contracts-stat';

  const valEl = document.createElement('div');
  valEl.className = 'contracts-stat-value';
  valEl.textContent = value;
  stat.appendChild(valEl);

  const labelEl = document.createElement('div');
  labelEl.className = 'contracts-stat-label';
  labelEl.textContent = label;
  stat.appendChild(labelEl);

  return stat;
}

function renderSearch(container: HTMLElement, state: State, repaint: () => void): void {
  container.replaceChildren();

  const icon = document.createElement('span');
  icon.className = 'payments-search-icon';
  icon.textContent = '🔎';
  container.appendChild(icon);

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Zoek op naam of nummer…';
  input.value = state.search;
  input.addEventListener('input', () => {
    state.search = input.value.trim().toLowerCase();
    repaint();
  });
  container.appendChild(input);

  if (state.search.length > 0) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'payments-search-clear';
    clear.textContent = '×';
    clear.addEventListener('click', () => {
      state.search = '';
      repaint();
    });
    container.appendChild(clear);
  }
}

function renderList(container: HTMLElement, state: State): void {
  container.replaceChildren();

  const filtered = state.contracts.filter((c) => {
    if (state.search.length === 0) {
      return true;
    }
    const haystack = `${c.contract_name ?? ''} ${c.contract_number}`.toLowerCase();
    return haystack.includes(state.search);
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      state.contracts.length === 0
        ? t('contracts.empty')
        : 'Geen contracten die voldoen aan de zoekterm.';
    container.appendChild(empty);
    return;
  }

  filtered.forEach((c) => container.appendChild(renderContractRow(c)));
}

function renderContractRow(contract: ContractRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'contract-row';

  const main = document.createElement('div');
  main.className = 'contract-main';

  const name = document.createElement('div');
  name.className = 'contract-name';
  name.textContent = contract.contract_name ?? contract.contract_number;
  main.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'contract-meta';
  const parts: string[] = [`Nr. ${contract.contract_number}`];
  if (contract.royalty_percentage !== null) {
    parts.push(`${contract.royalty_percentage.toFixed(1)}%`);
  }
  if (contract.start_date !== null) {
    parts.push(formatDate(contract.start_date));
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  row.appendChild(main);

  if (contract.file_path !== null) {
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'payment-download';
    downloadBtn.textContent = t('payments.download');
    downloadBtn.addEventListener('click', () => {
      void download(contract.file_path, downloadBtn);
    });
    row.appendChild(downloadBtn);
  } else {
    const missing = document.createElement('span');
    missing.className = 'payment-missing';
    missing.textContent = t('payments.missing_pdf');
    row.appendChild(missing);
  }

  return row;
}

async function download(filePath: string | null, btn: HTMLButtonElement): Promise<void> {
  if (filePath === null) {
    return;
  }
  btn.disabled = true;
  const { data, error } = await supabase.storage.from('statements').createSignedUrl(filePath, 60);
  btn.disabled = false;

  if (error !== null) {
    reportError('contracts.download', error);
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
