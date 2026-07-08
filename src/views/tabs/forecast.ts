/**
 * Prognose-tab — bewust "gesloten".
 *
 * De auteurs gaven aan geen prognose-functie te willen; die feedback wordt met
 * een knipoog teruggekoppeld. In plaats van forecast-data toont de tab één
 * statement, gebracht als een "stempel-storm": de (lege) prognose wordt
 * doorgestreept, vijf stempels ramen in met screen-shake + inktspatten, en de
 * boodschap punch't erdoorheen. Puur statisch — geen Supabase-call meer.
 *
 * Teksten lopen via i18n (NL/EN/SV); de ghost-label hergebruikt
 * `forecast.eyebrow_year`. Animaties zitten in CSS (.forecast-closed-*), met
 * een reduced-motion-fallback in main.css.
 *
 * @module views/tabs/forecast
 */

import { t } from '@/lib/i18n';
import type { TranslationKey } from '@/i18n/types';

interface StampSpec {
  key: TranslationKey;
  rot: string;
  delay: string;
  pos: string;
}

const STAMPS: StampSpec[] = [
  { key: 'forecast.closed_stamp_1', rot: '-13deg', delay: '0.35s', pos: 'left:12%;top:16%;' },
  { key: 'forecast.closed_stamp_2', rot: '9deg', delay: '0.55s', pos: 'right:6%;top:10%;' },
  {
    key: 'forecast.closed_stamp_3',
    rot: '-5deg',
    delay: '0.78s',
    pos: 'left:50%;top:42%;margin-left:-3.6rem;',
  },
  { key: 'forecast.closed_stamp_4', rot: '14deg', delay: '1s', pos: 'left:8%;bottom:14%;' },
  { key: 'forecast.closed_stamp_5', rot: '-9deg', delay: '1.18s', pos: 'right:12%;bottom:10%;' },
];

const SPLAT_COLORS = [
  'var(--color-accent-coral)',
  'var(--color-accent-purple)',
  'var(--color-accent-amber)',
  'var(--color-accent-blue)',
  'var(--color-danger)',
];

export function renderForecastTab(container: HTMLElement): void {
  const stage = document.createElement('div');
  stage.className = 'forecast-closed';

  const top = document.createElement('div');
  top.className = 'forecast-closed-top';

  // Inktspatten (decoratief) — vallen samen met de inslaande stempels.
  const splat = document.createElement('div');
  splat.className = 'forecast-closed-splat';
  splat.setAttribute('aria-hidden', 'true');
  for (const dot of buildSplatDots()) {
    splat.appendChild(dot);
  }
  top.appendChild(splat);

  // Doorgestreepte, nooit-in-te-vullen prognose (bewust dashes, geen echt bedrag).
  const ghost = document.createElement('div');
  ghost.className = 'forecast-closed-ghost';
  ghost.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'forecast-closed-label';
  label.textContent = t('forecast.eyebrow_year').replace('{year}', '2027');
  ghost.appendChild(label);

  const amount = document.createElement('span');
  amount.className = 'forecast-closed-amount';
  amount.textContent = '€ ——,—— – € ——,——';
  const strike = document.createElement('span');
  strike.className = 'forecast-closed-strike';
  amount.appendChild(strike);
  ghost.appendChild(amount);

  top.appendChild(ghost);

  // Inslaande stempels.
  for (const spec of STAMPS) {
    const stamp = document.createElement('span');
    stamp.className = 'forecast-closed-stamp';
    stamp.textContent = t(spec.key);
    stamp.setAttribute('aria-hidden', 'true');
    stamp.style.cssText = `--rot:${spec.rot};--fc-d:${spec.delay};${spec.pos}`;
    top.appendChild(stamp);
  }

  stage.appendChild(top);

  // De boodschap zelf — draagt de betekenis (ook voor screenreaders).
  const headline = document.createElement('h2');
  headline.className = 'forecast-closed-headline';
  headline.textContent = t('forecast.closed_message');
  stage.appendChild(headline);

  container.appendChild(stage);
}

function buildSplatDots(): HTMLElement[] {
  const dots: HTMLElement[] = [];
  for (let i = 0; i < 20; i++) {
    const dot = document.createElement('span');
    dot.className = 'forecast-closed-dot';
    const size = 4 + ((i * 13) % 12);
    const left = 6 + ((i * 41) % 88);
    const top = 10 + ((i * 57) % 78);
    const delay = 0.35 + ((i * 29) % 90) / 100;
    const color = SPLAT_COLORS[i % SPLAT_COLORS.length] ?? 'var(--color-accent-coral)';
    dot.style.cssText =
      `width:${String(size)}px;height:${String(size)}px;` +
      `left:${String(left)}%;top:${String(top)}%;` +
      `background:${color};` +
      `--fc-d:${delay.toFixed(2)}s;`;
    dots.push(dot);
  }
  return dots;
}
