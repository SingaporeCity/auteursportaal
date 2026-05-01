/**
 * FAQ-tab: statische vragen en antwoorden in een accordion.
 *
 * Geen DB-call — content komt uit een lokaal data-object. Volledige set
 * (16 vragen in oude demo) wordt later overgenomen of door admin-content-
 * management gevuld.
 *
 * @module views/tabs/faq
 */

import { t } from '@/lib/i18n';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Wanneer ontvang ik mijn royalty-afrekening?',
    answer:
      'Royalty-afrekeningen worden jaarlijks in maart uitgekeerd over het voorgaande jaar. U ontvangt een notificatie zodra een nieuwe afrekening klaar staat in dit portaal.',
  },
  {
    question: 'Hoe wijzig ik mijn persoonlijke gegevens?',
    answer:
      'Op het tabblad Profiel kunt u uw gegevens bekijken. Wijzigingen verlopen via een verzoek dat door de uitgever wordt beoordeeld voordat het definitief wordt doorgevoerd.',
  },
  {
    question: 'Mijn afrekening klopt niet — wat nu?',
    answer:
      'Neem contact op met rights@noordhoff.nl. Vermeld uw Vendor ID en het betreffende afrekeningsjaar; we kijken er zo snel mogelijk naar.',
  },
  {
    question: 'Hoe dien ik een declaratie in?',
    answer:
      'Op het tabblad Declaraties vult u een korte omschrijving en bedrag in en uploadt u de bijbehorende bon (PDF). U ontvangt bericht zodra de declaratie is beoordeeld.',
  },
  {
    question: 'Hoe wordt mijn data beschermd?',
    answer:
      'Uw data is uitsluitend zichtbaar voor uzelf en de geautoriseerde administrator. Alle communicatie verloopt over een versleutelde verbinding (HTTPS) en de database hanteert strikte toegangsregels per gebruiker.',
  },
];

export function renderFaqTab(container: HTMLElement): void {
  const heading = document.createElement('h2');
  heading.textContent = t('faq.title');
  container.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'faq-intro';
  intro.textContent = t('faq.intro');
  container.appendChild(intro);

  const list = document.createElement('div');
  list.className = 'faq-list';
  FAQ_ITEMS.forEach((item) => {
    list.appendChild(renderFaqItem(item));
  });
  container.appendChild(list);
}

function renderFaqItem(item: FaqItem): HTMLElement {
  const details = document.createElement('details');
  details.className = 'faq-item';

  const summary = document.createElement('summary');
  summary.className = 'faq-question';
  summary.textContent = item.question;
  details.appendChild(summary);

  const answer = document.createElement('div');
  answer.className = 'faq-answer';
  answer.textContent = item.answer;
  details.appendChild(answer);

  return details;
}
