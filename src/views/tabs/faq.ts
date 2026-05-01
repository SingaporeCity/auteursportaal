/**
 * FAQ-tab — 14 vragen verdeeld over 4 categorieën (geport uit demo).
 *
 * HTML in answers wordt gesanitized via DOMPurify (allow `<strong>` + `<a>`).
 *
 * @module views/tabs/faq
 */

import DOMPurify from 'dompurify';
import { t } from '@/lib/i18n';
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqCategory, type FaqItem } from './faq-data';

export function renderFaqTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('faq.title');
  container.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'faq-intro';
  intro.textContent = t('faq.intro');
  container.appendChild(intro);

  for (const category of FAQ_CATEGORIES) {
    const itemsInCat = FAQ_ITEMS.filter((q) => q.category === category.id);
    if (itemsInCat.length === 0) {
      continue;
    }
    container.appendChild(buildCategory(category.id, category.label, itemsInCat));
  }
}

function buildCategory(catId: FaqCategory, label: string, items: readonly FaqItem[]): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'faq-category';
  wrap.dataset['category'] = catId;

  const header = document.createElement('h4');
  header.className = 'faq-category-header';
  header.textContent = label;
  wrap.appendChild(header);

  const list = document.createElement('div');
  list.className = 'faq-list';
  items.forEach((item) => {
    list.appendChild(buildItem(item));
  });
  wrap.appendChild(list);

  return wrap;
}

function buildItem(item: FaqItem): HTMLElement {
  const details = document.createElement('details');
  details.className = 'faq-item';

  const summary = document.createElement('summary');
  summary.className = 'faq-question';
  summary.textContent = item.question;
  details.appendChild(summary);

  const answer = document.createElement('div');
  answer.className = 'faq-answer';

  // Sanitized HTML — alleen <strong>, <a>, <em>, <br> toegestaan
  // eslint-disable-next-line no-unsanitized/property -- DOMPurify.sanitize is de aangewezen sanitizer
  answer.innerHTML = DOMPurify.sanitize(item.answer, {
    ALLOWED_TAGS: ['strong', 'em', 'a', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
  details.appendChild(answer);

  return details;
}
