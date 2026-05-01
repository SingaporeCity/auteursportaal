/**
 * Start-tab: welkomstkaart + KPI-tegels op basis van eigen payment-records.
 *
 * Geen demo-data: KPI's worden direct uit Supabase berekend (RLS isoleert
 * naar de eigen rijen). Bij `amount = 0` (placeholder na seed) toont de
 * KPI gewoon €0,00 — dat is realistisch tot de admin echte bedragen invult.
 *
 * @module views/tabs/start
 */

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database } from '@/types/db';

type PaymentRow = Database['public']['Tables']['payments']['Row'];

export function renderStartTab(container: HTMLElement, author: AuthorRow): void {
  const welcome = document.createElement('div');
  welcome.className = 'start-welcome';

  const greetingText = greetingFor(new Date());
  const heading = document.createElement('h2');
  heading.textContent = `${greetingText}, ${author.first_name}`;
  welcome.appendChild(heading);

  const sub = document.createElement('p');
  sub.className = 'start-welcome-sub';
  sub.textContent = t('app.tagline');
  welcome.appendChild(sub);

  container.appendChild(welcome);

  const kpiRow = document.createElement('div');
  kpiRow.className = 'kpi-row';
  kpiRow.textContent = '…';
  container.appendChild(kpiRow);

  void loadKpis(kpiRow);
}

async function loadKpis(container: HTMLElement): Promise<void> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('payment_date', { ascending: false });

  container.replaceChildren();

  if (error !== null) {
    reportError('start.loadKpis', error);
    container.textContent = `Kon KPI's niet laden: ${error.message}`;
    return;
  }

  const totalAll = data.reduce((sum, p) => sum + p.amount, 0);
  const currentYear = new Date().getFullYear();
  const totalThisYear = data
    .filter((p) => p.year === currentYear)
    .reduce((sum, p) => sum + p.amount, 0);
  const count = data.length;
  const last: PaymentRow | undefined = data[0];

  container.appendChild(kpiCard('start.kpi.total_paid', formatCurrency(totalAll)));
  container.appendChild(kpiCard('start.kpi.this_year', formatCurrency(totalThisYear)));
  container.appendChild(kpiCard('start.kpi.statements_count', String(count)));
  container.appendChild(
    kpiCard(
      'start.kpi.last_payment',
      last !== undefined && last.payment_date !== null ? formatDate(last.payment_date) : '—'
    )
  );
}

function kpiCard(labelKey: Parameters<typeof t>[0], value: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'kpi-card';

  const label = document.createElement('div');
  label.className = 'kpi-label';
  label.textContent = t(labelKey);
  card.appendChild(label);

  const val = document.createElement('div');
  val.className = 'kpi-value';
  val.textContent = value;
  card.appendChild(val);

  return card;
}

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 6) {
    return t('greeting.night');
  }
  if (hour < 12) {
    return t('greeting.morning');
  }
  if (hour < 18) {
    return t('greeting.afternoon');
  }
  return t('greeting.evening');
}
