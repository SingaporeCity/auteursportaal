/**
 * Afrekeningen-tab: lijst alle payments van de ingelogde auteur, gegroepeerd
 * per jaar (nieuwste eerst). Klik op de download-knop genereert een
 * gesigneerde URL (60s geldig) en triggert een browser-download.
 *
 * RLS-isolatie wordt door Supabase afgedwongen — een auteur ziet alleen
 * eigen rijen. Het debug-panel toont de count als check.
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

export function renderPaymentsTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = 'Royalty-afrekeningen';
  container.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'payments-list';
  list.textContent = 'Laden…';
  container.appendChild(list);

  void loadAndRender(list);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('year', { ascending: false })
    .order('payment_date', { ascending: false });

  container.replaceChildren();

  if (error !== null) {
    reportError('payments.load', error);
    const errBox = document.createElement('div');
    errBox.className = 'payments-error';
    errBox.textContent = `Kon afrekeningen niet laden: ${error.message}`;
    container.appendChild(errBox);
    return;
  }

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'payments-empty';
    empty.textContent = 'Geen afrekeningen beschikbaar.';
    container.appendChild(empty);
    return;
  }

  const byYear = groupByYear(data);
  for (const [year, payments] of byYear) {
    const yearHeader = document.createElement('h3');
    yearHeader.className = 'payments-year-header';
    yearHeader.textContent = String(year);
    container.appendChild(yearHeader);

    payments.forEach((payment) => {
      container.appendChild(renderPaymentRow(payment));
    });
  }
}

function renderPaymentRow(payment: PaymentRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'payment-row';

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

  // Triggert browser-download in een nieuwe tab
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

function groupByYear(payments: PaymentRow[]): Map<number, PaymentRow[]> {
  const map = new Map<number, PaymentRow[]>();
  for (const payment of payments) {
    const list = map.get(payment.year) ?? [];
    list.push(payment);
    map.set(payment.year, list);
  }
  return map;
}
