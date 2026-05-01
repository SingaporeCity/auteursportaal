/**
 * Prognose-tab: hero-card met verwachte royalty-range voor het lopende jaar.
 *
 * Toont alleen iets als er een forecast-record is voor dit jaar; anders een
 * empty-state. Geen demo-data — bewust geen placeholder-bedragen.
 *
 * @module views/tabs/forecast
 */

import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';
import type { Database } from '@/types/db';

type ForecastRow = Database['public']['Tables']['forecasts']['Row'];

export function renderForecastTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('forecast.title');
  container.appendChild(heading);

  const slot = document.createElement('div');
  slot.className = 'forecast-slot';
  slot.textContent = '…';
  container.appendChild(slot);

  const disclaimer = document.createElement('p');
  disclaimer.className = 'forecast-disclaimer';
  disclaimer.textContent = t('forecast.disclaimer');
  container.appendChild(disclaimer);

  void loadAndRender(slot);
}

async function loadAndRender(container: HTMLElement): Promise<void> {
  const currentYear = new Date().getFullYear();
  const { data, error } = await supabase
    .from('forecasts')
    .select('*')
    .order('year', { ascending: false });

  container.replaceChildren();

  if (error !== null) {
    reportError('forecast.load', error);
    container.textContent = `Fout: ${error.message}`;
    return;
  }

  if (data.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('forecast.empty');
    container.appendChild(empty);
    return;
  }

  // Toon de hero (lopend jaar als beschikbaar, anders meest recente)
  const current: ForecastRow | undefined = data.find((f) => f.year === currentYear) ?? data[0];
  if (current === undefined) {
    return;
  }
  container.appendChild(renderHero(current));

  // Historische / andere jaren als kleinere rijen
  data
    .filter((f) => f !== current)
    .forEach((f) => {
      container.appendChild(renderRow(f));
    });
}

function renderHero(forecast: ForecastRow): HTMLElement {
  const card = document.createElement('div');
  card.className = 'forecast-hero';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'forecast-eyebrow';
  eyebrow.textContent = `${t('forecast.range_label')} ${String(forecast.year)}`;
  card.appendChild(eyebrow);

  const range = document.createElement('div');
  range.className = 'forecast-range';
  range.textContent = `${formatCurrency(forecast.min_amount)} — ${formatCurrency(forecast.max_amount)}`;
  card.appendChild(range);

  return card;
}

function renderRow(forecast: ForecastRow): HTMLElement {
  const row = document.createElement('div');
  row.className = 'forecast-row';

  const year = document.createElement('span');
  year.className = 'forecast-row-year';
  year.textContent = String(forecast.year);
  row.appendChild(year);

  const range = document.createElement('span');
  range.className = 'forecast-row-range';
  range.textContent = `${formatCurrency(forecast.min_amount)} — ${formatCurrency(forecast.max_amount)}`;
  row.appendChild(range);

  return row;
}
