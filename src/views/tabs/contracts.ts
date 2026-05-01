/**
 * Contracten-tab: lijst contracten van de ingelogde auteur.
 *
 * RLS isoleert per author_id. Klik op de download-knop genereert een
 * gesigneerde URL voor de contract-PDF (zelfde Storage-bucket als payments).
 *
 * @module views/tabs/contracts
 */

import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database } from '@/types/db';

type ContractRow = Database['public']['Tables']['contracts']['Row'];

export function renderContractsTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('contracts.title');
  container.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'contracts-list';
  list.textContent = '…';
  container.appendChild(list);

  const contact = document.createElement('p');
  contact.className = 'contracts-contact';
  contact.textContent = t('contracts.contact_text');
  container.appendChild(contact);

  void loadAndRender(list);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('start_date', { ascending: false });

  container.replaceChildren();

  if (error !== null) {
    reportError('contracts.load', error);
    container.textContent = `Fout: ${error.message}`;
    return;
  }

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('contracts.empty');
    container.appendChild(empty);
    return;
  }

  data.forEach((contract) => {
    container.appendChild(renderContractRow(contract));
  });
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
    parts.push(`${String(contract.royalty_percentage)}%`);
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
