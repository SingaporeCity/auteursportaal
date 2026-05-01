/**
 * Start-tab — Year-in-Review hero + royalty chart per jaar.
 *
 * Designtaal van demo geport:
 * - Donkergroene gradient hero-card met decoratieve cirkels en 3-grid stats
 * - Royalty chart als CSS-grid van kaarten per jaar met gesegmenteerde bars
 *
 * Bedragen worden direct uit de `payments`-tabel berekend (RLS-geïsoleerd).
 *
 * @module views/tabs/start
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import type { Database, PaymentType } from '@/types/db';

type PaymentRow = Database['public']['Tables']['payments']['Row'];
type ForecastRow = Database['public']['Tables']['forecasts']['Row'];

const FORECAST_YEAR = 2027;
const FORECAST_ANNOUNCEMENT_DATE = '31-10-2026';

const TYPE_LABEL: Record<PaymentType, string> = {
  royalty: 'Royalties',
  subsidiary: 'Nevenrechten',
  foreign: 'Foreign Rights',
  jaaropgave: 'Jaaropgave',
};

const TYPE_COLOR: Record<PaymentType, string> = {
  royalty: 'var(--color-primary)',
  subsidiary: 'var(--color-accent-blue)',
  foreign: 'var(--color-accent-coral)',
  jaaropgave: 'var(--color-accent-purple)',
};

export function renderStartTab(container: HTMLElement): void {
  // Greeting + tagline staan nu in de welcome-section boven de tabs
  // (zie src/views/shared/welcome-section.ts) — niet meer hier.
  const slot = document.createElement('div');
  slot.className = 'start-slot';
  slot.textContent = '…';
  container.appendChild(slot);

  void loadAndRender(slot);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const [paymentRes, forecastRes] = await Promise.all([
    supabase.from('payments').select('*').order('payment_date', { ascending: false }),
    supabase.from('forecasts').select('*').order('year', { ascending: false }),
  ]);

  container.replaceChildren();

  if (paymentRes.error !== null) {
    reportError('start.load', paymentRes.error);
    container.textContent = `Kon Start niet laden: ${paymentRes.error.message}`;
    return;
  }

  const data = paymentRes.data;
  const forecasts = forecastRes.error === null ? forecastRes.data : [];

  // Alleen royalty-uitkeringen tellen mee voor totalen — jaaropgaves zijn
  // fiscale overzichten, geen uitkeringen.
  const royalties = data.filter((p) => p.type !== 'jaaropgave');

  // Group op uitbetaal-jaar (year of payment_date), niet op royalty-year
  const paidYears = [
    ...new Set(royalties.map(paidYear).filter((y): y is number => y !== null)),
  ].sort((a, b) => b - a);
  const reviewYear = paidYears[0] ?? new Date().getFullYear() - 1;

  container.appendChild(buildYearInReview(royalties, reviewYear, forecasts));

  if (royalties.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      'Nog geen afrekeningen — zodra de eerste statement is geüpload zie je hier het overzicht per jaar.';
    container.appendChild(empty);
    return;
  }

  container.appendChild(buildRoyaltyChart(royalties, paidYears));

  // Events + News + Academy in 3-koloms grid (zoals demo)
  const eventsNewsGrid = document.createElement('div');
  eventsNewsGrid.className = 'start-events-news start-events-news-3';
  eventsNewsGrid.appendChild(buildEventsTile());
  eventsNewsGrid.appendChild(buildNewsTile());
  eventsNewsGrid.appendChild(buildAcademyTile());
  container.appendChild(eventsNewsGrid);
}

// =============================================================================
// Evenementen + Nieuws (statische placeholders)
// =============================================================================
interface EventItem {
  day: string;
  month: string;
  title: string;
  location?: string;
}

interface NewsItem {
  title: string;
  date: string;
}

const EVENTS: EventItem[] = [
  {
    day: '21',
    month: 'jun',
    title: 'Noordhoff 190 jaar — Jubileumfeest',
    location: 'Martiniplaza Groningen',
  },
  { day: '5', month: 'jun', title: 'Auteursbijeenkomst: Nieuwe kerndoelen' },
  { day: '15', month: 'mei', title: 'Workshop: Schrijven voor Learnbeat' },
];

const NEWS: NewsItem[] = [
  { title: 'Moderne Wiskunde 14e editie verschijnt 1 juni', date: '8 april 2026' },
  { title: 'Klaar voor de nieuwe kerndoelen met Noordhoff', date: '22 maart 2026' },
  { title: 'Noordhoff viert 190-jarig bestaan in 2026', date: '5 maart 2026' },
];

function buildEventsTile(): HTMLElement {
  const tile = document.createElement('section');
  tile.className = 'dash-tile';

  const header = document.createElement('div');
  header.className = 'dash-tile-header';
  const title = document.createElement('h3');
  title.className = 'dash-tile-title';
  title.textContent = 'Aankomende evenementen';
  header.appendChild(title);
  tile.appendChild(header);

  const list = document.createElement('div');
  list.className = 'events-list';

  EVENTS.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'event-row';

    const date = document.createElement('div');
    date.className = 'event-date';

    const day = document.createElement('div');
    day.className = 'event-day';
    day.textContent = event.day;
    date.appendChild(day);

    const month = document.createElement('div');
    month.className = 'event-month';
    month.textContent = event.month;
    date.appendChild(month);

    row.appendChild(date);

    const main = document.createElement('div');
    main.className = 'event-main';
    const titleEl = document.createElement('div');
    titleEl.className = 'event-title';
    titleEl.textContent = event.title;
    main.appendChild(titleEl);

    if (event.location !== undefined) {
      const locEl = document.createElement('div');
      locEl.className = 'event-location';
      locEl.textContent = event.location;
      main.appendChild(locEl);
    }
    row.appendChild(main);

    list.appendChild(row);
  });

  tile.appendChild(list);
  return tile;
}

function buildNewsTile(): HTMLElement {
  const tile = document.createElement('section');
  tile.className = 'dash-tile';

  const header = document.createElement('div');
  header.className = 'dash-tile-header';
  const title = document.createElement('h3');
  title.className = 'dash-tile-title';
  title.textContent = 'Laatste nieuws';
  header.appendChild(title);
  tile.appendChild(header);

  const list = document.createElement('div');
  list.className = 'news-list';

  NEWS.forEach((news) => {
    const row = document.createElement('article');
    row.className = 'news-row';

    const titleEl = document.createElement('div');
    titleEl.className = 'news-title';
    titleEl.textContent = news.title;
    row.appendChild(titleEl);

    const dateEl = document.createElement('div');
    dateEl.className = 'news-date';
    dateEl.textContent = news.date;
    row.appendChild(dateEl);

    list.appendChild(row);
  });

  tile.appendChild(list);
  return tile;
}

// Helper: jaar van uitbetaling (uit payment_date), of null als nog niet betaald
function paidYear(payment: PaymentRow): number | null {
  if (payment.payment_date === null) {
    return null;
  }
  return new Date(payment.payment_date).getFullYear();
}

// =============================================================================
// Year-in-Review hero
// =============================================================================
function buildYearInReview(
  payments: PaymentRow[],
  reviewYear: number,
  forecasts: ForecastRow[]
): HTMLElement {
  const card = document.createElement('section');
  card.className = 'yr-card';

  // Header met badge + jaarlabel
  const header = document.createElement('div');
  header.className = 'yr-header';

  const badge = document.createElement('span');
  badge.className = 'yr-badge';
  badge.textContent = 'Jaaroverzicht';
  header.appendChild(badge);

  const yearLabel = document.createElement('span');
  yearLabel.className = 'yr-year';
  yearLabel.textContent = String(reviewYear);
  header.appendChild(yearLabel);

  card.appendChild(header);

  // Hero bedrag — sum van royalty's die zijn UITBETAALD in reviewYear
  const reviewTotal = sumPaidYear(payments, reviewYear);
  const previousTotal = sumPaidYear(payments, reviewYear - 1);
  const yoy = computeYoY(reviewTotal, previousTotal);

  const hero = document.createElement('div');
  hero.className = 'yr-hero-block';

  const heroLabel = document.createElement('div');
  heroLabel.className = 'yr-hero-label';
  heroLabel.textContent = `Uitgekeerd in ${String(reviewYear)}`;
  hero.appendChild(heroLabel);

  const heroValue = document.createElement('div');
  heroValue.className = 'yr-hero-value';
  heroValue.textContent = formatCurrency(reviewTotal);
  hero.appendChild(heroValue);

  if (yoy !== null) {
    const change = document.createElement('span');
    change.className = `yr-hero-change ${yoy.direction}`;
    const arrow = yoy.direction === 'up' ? '▲' : yoy.direction === 'down' ? '▼' : '–';
    change.textContent = `${arrow} ${yoy.percentage}% t.o.v. ${String(reviewYear - 1)}`;
    hero.appendChild(change);
  }

  card.appendChild(hero);

  // 3-grid sub-stats
  const stats = document.createElement('div');
  stats.className = 'yr-stats';

  // -- 1. "Totaal vanaf [jaar-toggle]"
  stats.appendChild(buildTotalFromBlock(payments));

  // -- 2. "Laatste betaling" — datum + bedrag
  stats.appendChild(buildLastPaymentBlock(payments));

  // -- 3. "Prognose: Verwacht in [jaar]"
  stats.appendChild(buildForecastBlock(forecasts));

  card.appendChild(stats);
  return card;
}

function buildTotalFromBlock(payments: PaymentRow[]): HTMLElement {
  const block = document.createElement('div');
  block.className = 'yr-stat yr-stat-toggleable';

  const labelRow = document.createElement('div');
  labelRow.className = 'yr-stat-label-row';

  const label = document.createElement('span');
  label.className = 'yr-stat-label';
  label.textContent = 'Totaal vanaf';
  labelRow.appendChild(label);
  block.appendChild(labelRow);

  // Pill toggle voor uitbetaaljaren (oudste eerst)
  const yearsAvailable = [
    ...new Set(payments.map(paidYear).filter((y): y is number => y !== null)),
  ].sort((a, b) => a - b);

  const valueEl = document.createElement('div');
  valueEl.className = 'yr-stat-value';
  block.appendChild(valueEl);

  const pills = document.createElement('div');
  pills.className = 'yr-from-pills';

  let activeFrom = yearsAvailable[0] ?? new Date().getFullYear();

  const updateValue = (): void => {
    const total = payments
      .filter((p) => {
        const py = paidYear(p);
        return py !== null && py >= activeFrom;
      })
      .reduce((sum, p) => sum + p.amount, 0);
    valueEl.textContent = formatCurrency(total);
  };
  updateValue();

  for (const yr of yearsAvailable) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'yr-from-pill';
    if (yr === activeFrom) {
      pill.classList.add('active');
    }
    pill.textContent = String(yr);
    pill.addEventListener('click', () => {
      activeFrom = yr;
      [...pills.children].forEach((node) => {
        const p = node as HTMLButtonElement;
        p.classList.toggle('active', p.textContent === String(yr));
      });
      updateValue();
    });
    pills.appendChild(pill);
  }
  block.appendChild(pills);

  return block;
}

function buildLastPaymentBlock(payments: PaymentRow[]): HTMLElement {
  const block = document.createElement('div');
  block.className = 'yr-stat';

  const label = document.createElement('div');
  label.className = 'yr-stat-label';
  label.textContent = 'Laatste betaling';
  block.appendChild(label);

  // payments parameter bevat al alleen royalty's (jaaropgaves geëxcludeerd)
  const sorted = payments
    .filter((p) => p.payment_date !== null)
    .sort((a, b) => (b.payment_date ?? '').localeCompare(a.payment_date ?? ''));

  const last = sorted[0];

  const valueEl = document.createElement('div');
  valueEl.className = 'yr-stat-value';
  valueEl.textContent = last !== undefined ? formatCurrency(last.amount) : '—';
  block.appendChild(valueEl);

  const sub = document.createElement('div');
  sub.className = 'yr-stat-sub';
  sub.textContent =
    last !== undefined && last.payment_date !== null ? formatDate(last.payment_date) : '';
  block.appendChild(sub);

  return block;
}

function buildForecastBlock(forecasts: ForecastRow[]): HTMLElement {
  const block = document.createElement('div');
  block.className = 'yr-stat';

  const label = document.createElement('div');
  label.className = 'yr-stat-label';
  label.textContent = `Verwacht in ${String(FORECAST_YEAR)}`;
  block.appendChild(label);

  const fc = forecasts.find((f) => f.year === FORECAST_YEAR);

  const valueEl = document.createElement('div');
  valueEl.className = 'yr-stat-value';
  if (fc !== undefined && fc.max_amount > 0) {
    valueEl.textContent = `${formatCurrency(fc.min_amount)} — ${formatCurrency(fc.max_amount)}`;
    valueEl.classList.add('yr-stat-value-range');
  } else {
    valueEl.textContent = 'Wordt bekendgemaakt';
    valueEl.classList.add('yr-stat-value-pending');
  }
  block.appendChild(valueEl);

  const sub = document.createElement('div');
  sub.className = 'yr-stat-sub';
  sub.textContent =
    fc !== undefined && fc.max_amount > 0
      ? 'Indicatieve bandbreedte'
      : `Op ${FORECAST_ANNOUNCEMENT_DATE}`;
  block.appendChild(sub);

  return block;
}

// =============================================================================
// Royalty chart — kaarten per jaar
// =============================================================================
function buildRoyaltyChart(payments: PaymentRow[], years: number[]): HTMLElement {
  const tile = document.createElement('section');
  tile.className = 'dash-tile';

  const header = document.createElement('div');
  header.className = 'dash-tile-header';
  const title = document.createElement('h3');
  title.className = 'dash-tile-title';
  title.textContent = 'Royalty-overzicht';
  header.appendChild(title);
  tile.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'chart-years';
  years.forEach((year, index) => {
    grid.appendChild(buildYearCard(payments, year, index));
  });
  tile.appendChild(grid);

  return tile;
}

function buildYearCard(payments: PaymentRow[], year: number, index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.style.animationDelay = `${String(index * 60)}ms`;

  // Group op uitbetaaljaar (year of payment_date) — niet op royalty-year column
  const yearPayments = payments.filter((p) => paidYear(p) === year);
  const total = yearPayments.reduce((sum, p) => sum + p.amount, 0);
  const previous = sumPaidYear(payments, year - 1);
  const yoy = computeYoY(total, previous);

  // Header
  const header = document.createElement('div');
  header.className = 'chart-card-header';

  const yearLabel = document.createElement('span');
  yearLabel.className = 'chart-card-year';
  yearLabel.textContent = String(year);
  header.appendChild(yearLabel);

  if (yoy !== null && yoy.direction !== 'neutral') {
    const change = document.createElement('span');
    change.className = `chart-card-change ${yoy.direction}`;
    const arrow = yoy.direction === 'up' ? '↑' : '↓';
    change.textContent = `${arrow} ${yoy.percentage}%`;
    header.appendChild(change);
  }
  card.appendChild(header);

  // Bedrag
  const amount = document.createElement('div');
  amount.className = 'chart-card-amount';
  amount.textContent = formatCurrency(total);
  card.appendChild(amount);

  // Bar (alleen als er bedragen > 0 zijn)
  if (total > 0) {
    const bar = document.createElement('div');
    bar.className = 'chart-card-bar';

    const byType = groupByType(yearPayments);
    for (const [type, sum] of byType) {
      if (sum <= 0) {
        continue;
      }
      const seg = document.createElement('div');
      seg.className = 'chart-card-bar-seg';
      seg.style.width = `${String((sum / total) * 100)}%`;
      seg.style.background = TYPE_COLOR[type];
      bar.appendChild(seg);
    }
    card.appendChild(bar);

    // Pills per type
    const pills = document.createElement('div');
    pills.className = 'chart-card-pills';
    for (const [type, sum] of byType) {
      if (sum <= 0) {
        continue;
      }
      pills.appendChild(buildPill(TYPE_LABEL[type], sum, TYPE_COLOR[type]));
    }
    card.appendChild(pills);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'chart-card-placeholder';
    placeholder.textContent = 'Bedragen nog niet ingevoerd';
    card.appendChild(placeholder);
  }

  return card;
}

function buildPill(label: string, amount: number, color: string): HTMLElement {
  const pill = document.createElement('div');
  pill.className = 'chart-card-pill';

  const dot = document.createElement('span');
  dot.className = 'chart-card-pill-dot';
  dot.style.background = color;
  pill.appendChild(dot);

  const text = document.createElement('span');
  text.textContent = label;
  pill.appendChild(text);

  const strong = document.createElement('strong');
  strong.textContent = formatCurrency(amount);
  pill.appendChild(strong);

  return pill;
}

// =============================================================================
// Academy tile
// =============================================================================
function buildAcademyTile(): HTMLElement {
  const link = document.createElement('a');
  link.className = 'academy-tile';
  link.href = 'https://noordhoffacademy.nl/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const header = document.createElement('div');
  header.className = 'academy-tile-header';

  const logo = document.createElement('img');
  logo.src = '/noordhoff-logo.png';
  logo.alt = 'Noordhoff';
  logo.className = 'academy-tile-logo';
  header.appendChild(logo);

  const divider = document.createElement('span');
  divider.className = 'academy-tile-divider';
  header.appendChild(divider);

  const label = document.createElement('span');
  label.className = 'academy-tile-label';
  label.textContent = 'ACADEMY';
  header.appendChild(label);

  const arrow = document.createElement('span');
  arrow.className = 'academy-tile-arrow';
  arrow.textContent = '→';
  header.appendChild(arrow);

  link.appendChild(header);

  const desc = document.createElement('p');
  desc.className = 'academy-tile-desc';
  desc.textContent = 'Workshops, didactiek en digitale tools om je auteurschap te verdiepen.';
  link.appendChild(desc);

  const tags = document.createElement('div');
  tags.className = 'academy-tile-tags';
  ['Workshops', 'Didactiek', 'Digitaal'].forEach((tag) => {
    const t = document.createElement('span');
    t.className = 'academy-tile-tag';
    t.textContent = tag;
    tags.appendChild(t);
  });
  link.appendChild(tags);

  return link;
}

// =============================================================================
// Helpers
// =============================================================================
function sumPaidYear(payments: PaymentRow[], year: number): number {
  return payments.filter((p) => paidYear(p) === year).reduce((sum, p) => sum + p.amount, 0);
}

function groupByType(payments: PaymentRow[]): Map<PaymentType, number> {
  const map = new Map<PaymentType, number>();
  for (const p of payments) {
    map.set(p.type, (map.get(p.type) ?? 0) + p.amount);
  }
  return map;
}

interface YoY {
  direction: 'up' | 'down' | 'neutral';
  percentage: string;
}

function computeYoY(current: number, previous: number): YoY | null {
  if (previous <= 0 && current <= 0) {
    return null;
  }
  if (previous <= 0) {
    return { direction: 'up', percentage: '∞' };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) {
    return { direction: 'neutral', percentage: '0' };
  }
  return {
    direction: change > 0 ? 'up' : 'down',
    percentage: Math.abs(change).toFixed(1),
  };
}
