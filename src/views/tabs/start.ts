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

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database, PaymentType } from '@/types/db';

type PaymentRow = Database['public']['Tables']['payments']['Row'];

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

export function renderStartTab(container: HTMLElement, author: AuthorRow): void {
  const welcome = document.createElement('div');
  welcome.className = 'start-welcome';

  const heading = document.createElement('h2');
  heading.textContent = `${greetingFor(new Date())}, ${author.first_name}`;
  welcome.appendChild(heading);

  const sub = document.createElement('p');
  sub.className = 'start-welcome-sub';
  sub.textContent = t('app.tagline');
  welcome.appendChild(sub);

  container.appendChild(welcome);

  const slot = document.createElement('div');
  slot.className = 'start-slot';
  slot.textContent = '…';
  container.appendChild(slot);

  void loadAndRender(slot);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('payment_date', { ascending: false });

  container.replaceChildren();

  if (error !== null) {
    reportError('start.load', error);
    container.textContent = `Kon Start niet laden: ${error.message}`;
    return;
  }

  // Year-in-Review (laatste afgesloten jaar)
  const allYears = [...new Set(data.map((p) => p.year))].sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  const reviewYear = allYears.find((y) => y < currentYear) ?? allYears[0] ?? currentYear - 1;

  container.appendChild(buildYearInReview(data, reviewYear));

  if (allYears.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      'Nog geen afrekeningen — zodra de eerste statement is geüpload zie je hier het overzicht per jaar.';
    container.appendChild(empty);
    return;
  }

  container.appendChild(buildRoyaltyChart(data, allYears));
  container.appendChild(buildAcademyTile());
}

// =============================================================================
// Year-in-Review hero
// =============================================================================
function buildYearInReview(payments: PaymentRow[], reviewYear: number): HTMLElement {
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

  // Hero bedrag
  const reviewTotal = sumYear(payments, reviewYear);
  const previousTotal = sumYear(payments, reviewYear - 1);
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

  const allTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  stats.appendChild(buildStatBlock('Totaal uitgekeerd', formatCurrency(allTotal)));

  stats.appendChild(buildStatBlock('Aantal afrekeningen', String(payments.length)));

  const last = payments[0];
  stats.appendChild(
    buildStatBlock(
      'Laatste afrekening',
      last !== undefined && last.payment_date !== null ? formatDate(last.payment_date) : '—'
    )
  );

  card.appendChild(stats);
  return card;
}

function buildStatBlock(label: string, value: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'yr-stat';

  const valueEl = document.createElement('div');
  valueEl.className = 'yr-stat-value';
  valueEl.textContent = value;
  block.appendChild(valueEl);

  const labelEl = document.createElement('div');
  labelEl.className = 'yr-stat-label';
  labelEl.textContent = label;
  block.appendChild(labelEl);

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

  const yearPayments = payments.filter((p) => p.year === year);
  const total = yearPayments.reduce((sum, p) => sum + p.amount, 0);
  const previous = sumYear(payments, year - 1);
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
function sumYear(payments: PaymentRow[], year: number): number {
  return payments.filter((p) => p.year === year).reduce((sum, p) => sum + p.amount, 0);
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
