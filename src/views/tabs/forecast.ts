/**
 * Prognose-tab — hero card met range + payout-card + horizontale bar-chart.
 *
 * Layout uit demo:
 * - Bovenaan: 2-koloms grid met hero-card (groot range-bedrag) + payout-card
 *   (kalender-icoon + uitbetaal-maand)
 * - Onderaan: bar-chart card met horizontal bars per jaar (historisch teal,
 *   forecast als lichte vulling met range-overlay)
 *
 * @module views/tabs/forecast
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database } from '@/types/db';

type ForecastRow = Database['public']['Tables']['forecasts']['Row'];
type PaymentRow = Database['public']['Tables']['payments']['Row'];

export function renderForecastTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('forecast.title');
  container.appendChild(heading);

  const slot = document.createElement('div');
  slot.className = 'forecast-slot';
  slot.textContent = '…';
  container.appendChild(slot);

  void loadAndRender(slot);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const [forecastRes, paymentRes] = await Promise.all([
    supabase.from('forecasts').select('*').order('year', { ascending: false }),
    supabase.from('payments').select('*'),
  ]);

  container.replaceChildren();

  if (forecastRes.error !== null) {
    reportError('forecast.load', forecastRes.error);
    container.textContent = `Fout: ${forecastRes.error.message}`;
    return;
  }

  const forecasts = forecastRes.data;
  const payments = paymentRes.error === null ? paymentRes.data : [];

  // Forecast jaar: zoek het volgende ongepubliceerde jaar (default 2027)
  const forecastYear = forecasts.find((f) => f.max_amount > 0)?.year ?? 2027;
  const announcementDate = '31 oktober 2026';

  // Top row: pending-card (groot) + announcement-card (rechts)
  const topRow = document.createElement('div');
  topRow.className = 'forecast-top-row';

  const fc = forecasts.find((f) => f.year === forecastYear);
  if (fc !== undefined && fc.max_amount > 0) {
    topRow.appendChild(buildHero(fc));
    topRow.appendChild(buildPayout(fc));
  } else {
    topRow.appendChild(buildPendingHero(forecastYear, announcementDate));
    topRow.appendChild(buildAnnouncementCard(announcementDate));
  }
  container.appendChild(topRow);

  // History-bars: daadwerkelijke uitbetalingen per jaar (zelfde data als afrekeningen)
  if (payments.length > 0) {
    container.appendChild(buildHistoryBars(payments));
  }

  // -- Chart card
  container.appendChild(buildChart(payments, forecasts));

  const disclaimer = document.createElement('p');
  disclaimer.className = 'forecast-disclaimer';
  disclaimer.textContent = t('forecast.disclaimer');
  container.appendChild(disclaimer);
}

function buildPendingHero(year: number, announcementDate: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-hero forecast-hero-pending';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'forecast-eyebrow';
  eyebrow.textContent = `${t('forecast.title')} ${String(year)}`;
  card.appendChild(eyebrow);

  const headline = document.createElement('div');
  headline.className = 'forecast-pending-headline';
  headline.textContent = t('forecast.pending_headline');
  card.appendChild(headline);

  const sub = document.createElement('p');
  sub.className = 'forecast-pending-sub';
  const part1 = document.createTextNode(t('forecast.pending_sub_part1'));
  const dateStrong = document.createElement('strong');
  dateStrong.textContent = announcementDate;
  const part2 = document.createTextNode(
    t('forecast.pending_sub_part2').replace('{year}', String(year))
  );
  sub.append(part1, dateStrong, part2);
  card.appendChild(sub);

  return card;
}

function buildAnnouncementCard(announcementDate: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-announcement-card';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'forecast-eyebrow';
  eyebrow.textContent = t('forecast.publish_date_label');
  card.appendChild(eyebrow);

  const value = document.createElement('div');
  value.className = 'forecast-announcement-date';
  value.textContent = announcementDate;
  card.appendChild(value);

  const note = document.createElement('div');
  note.className = 'forecast-announcement-note';
  note.textContent = t('forecast.auto_notify');
  card.appendChild(note);

  return card;
}

function buildHistoryBars(payments: PaymentRow[]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-chart-card';

  const heading = document.createElement('h3');
  heading.className = 'dash-tile-title';
  heading.textContent = t('forecast.history_title');
  card.appendChild(heading);

  // Group op uitbetaal-jaar (year of payment_date), exclude jaaropgaves
  const royalties = payments.filter((p) => p.type !== 'jaaropgave');
  const byYear = new Map<number, number>();
  for (const p of royalties) {
    if (p.payment_date === null) {
      continue;
    }
    const year = new Date(p.payment_date).getFullYear();
    byYear.set(year, (byYear.get(year) ?? 0) + p.amount);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);
  const max = Math.max(...byYear.values());
  const scale = max * 1.15;

  const rows = document.createElement('div');
  rows.className = 'forecast-rows';

  for (const year of years) {
    const amount = byYear.get(year) ?? 0;
    const row = document.createElement('div');
    row.className = 'forecast-bar-row';

    const yearEl = document.createElement('span');
    yearEl.className = 'forecast-bar-year';
    yearEl.textContent = String(year);
    row.appendChild(yearEl);

    const track = document.createElement('div');
    track.className = 'forecast-bar-track';
    const fill = document.createElement('div');
    fill.className = 'forecast-bar-fill';
    fill.style.width = `${String((amount / scale) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(track);

    const value = document.createElement('span');
    value.className = 'forecast-bar-value';
    value.textContent = formatCurrency(amount);
    row.appendChild(value);

    rows.appendChild(row);
  }

  card.appendChild(rows);
  return card;
}

function buildHero(forecast: ForecastRow): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-hero';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'forecast-eyebrow';
  eyebrow.textContent = t('forecast.eyebrow_year').replace('{year}', String(forecast.year));
  card.appendChild(eyebrow);

  const range = document.createElement('div');
  range.className = 'forecast-range';
  range.textContent = `${formatCurrency(forecast.min_amount)} — ${formatCurrency(forecast.max_amount)}`;
  card.appendChild(range);

  const sub = document.createElement('div');
  sub.className = 'forecast-range-sub';
  sub.textContent = t('forecast.range_sub');
  card.appendChild(sub);

  return card;
}

function buildPayout(forecast: ForecastRow): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-payout';

  const icon = document.createElement('div');
  icon.className = 'forecast-payout-icon';
  icon.textContent = '🗓';
  icon.setAttribute('aria-hidden', 'true');
  card.appendChild(icon);

  const inner = document.createElement('div');
  inner.className = 'forecast-payout-inner';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'forecast-eyebrow';
  eyebrow.textContent = t('forecast.payout_label');
  inner.appendChild(eyebrow);

  const value = document.createElement('div');
  value.className = 'forecast-payout-month';
  value.textContent = t('forecast.payout_month').replace('{year}', String(forecast.year + 1));
  inner.appendChild(value);

  card.appendChild(inner);
  return card;
}

function buildChart(payments: PaymentRow[], forecasts: ForecastRow[]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-chart-card';

  const heading = document.createElement('h3');
  heading.className = 'dash-tile-title';
  heading.textContent = t('forecast.chart_title');
  card.appendChild(heading);

  // Verzamel historische totalen per jaar uit payments (alleen years zonder forecast)
  const forecastYears = new Set(forecasts.map((f) => f.year));
  const historic = new Map<number, number>();
  for (const p of payments) {
    if (forecastYears.has(p.year)) {
      continue;
    }
    historic.set(p.year, (historic.get(p.year) ?? 0) + p.amount);
  }

  const allMaxes = [...[...historic.values()], ...forecasts.map((f) => f.max_amount)];
  const maxAmount = allMaxes.length > 0 ? Math.max(...allMaxes) : 1;
  const scale = maxAmount * 1.15;

  const rows = document.createElement('div');
  rows.className = 'forecast-rows';

  // Combineer historische + forecast jaren, sorteer aflopend
  const allYears = [...new Set([...historic.keys(), ...forecasts.map((f) => f.year)])].sort(
    (a, b) => b - a
  );

  for (const year of allYears) {
    const fc = forecasts.find((f) => f.year === year);
    if (fc !== undefined) {
      rows.appendChild(buildForecastBar(fc, scale));
    } else {
      const total = historic.get(year) ?? 0;
      rows.appendChild(buildHistoricBar(year, total, scale));
    }
  }
  card.appendChild(rows);
  return card;
}

function buildHistoricBar(year: number, amount: number, scale: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'forecast-bar-row';

  const yearEl = document.createElement('span');
  yearEl.className = 'forecast-bar-year';
  yearEl.textContent = String(year);
  row.appendChild(yearEl);

  const track = document.createElement('div');
  track.className = 'forecast-bar-track';

  const fill = document.createElement('div');
  fill.className = 'forecast-bar-fill';
  fill.style.width = `${String((amount / scale) * 100)}%`;
  track.appendChild(fill);

  row.appendChild(track);

  const value = document.createElement('span');
  value.className = 'forecast-bar-value';
  value.textContent = formatCurrency(amount);
  row.appendChild(value);

  return row;
}

function buildForecastBar(forecast: ForecastRow, scale: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'forecast-bar-row forecast-bar-row-projection';

  const yearEl = document.createElement('span');
  yearEl.className = 'forecast-bar-year';
  yearEl.textContent = t('forecast.bar_year_projection').replace('{year}', String(forecast.year));
  row.appendChild(yearEl);

  const track = document.createElement('div');
  track.className = 'forecast-bar-track';

  const minPct = (forecast.min_amount / scale) * 100;
  const maxPct = (forecast.max_amount / scale) * 100;

  // Lichte vulling tot max
  const light = document.createElement('div');
  light.className = 'forecast-bar-fill forecast-bar-fill-light';
  light.style.width = `${String(maxPct)}%`;
  track.appendChild(light);

  // Donkere range overlay min→max
  const range = document.createElement('div');
  range.className = 'forecast-bar-range';
  range.style.left = `${String(minPct)}%`;
  range.style.width = `${String(maxPct - minPct)}%`;
  track.appendChild(range);

  row.appendChild(track);

  const value = document.createElement('span');
  value.className = 'forecast-bar-value forecast-bar-value-range';
  value.textContent = `${formatCurrency(forecast.min_amount)} — ${formatCurrency(forecast.max_amount)}`;
  row.appendChild(value);

  return row;
}
