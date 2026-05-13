/**
 * Onboarding-banner — toont boven de tabs zolang de auteur niet `active` is.
 *
 * Drie varianten:
 *  - `pending_data` met blocking-fields-missing — auteur moet IBAN/BIC/
 *    adres/BSN aanvullen voordat het account actief kan worden.
 *  - `pending_data` met alleen soft-fields-missing (telefoon en/of
 *    geboortedatum) — verplichte info is compleet, Noordhoff activeert
 *    binnenkort, soft-velden mogen nu nog rustig aangevuld worden.
 *  - `pending_admin_review` — auteur heeft ingediend, wacht op admin-OK.
 *
 * Wordt gemount door `dashboard.ts` wanneer `mode === 'onboarding'`.
 *
 * @module views/shared/onboarding-banner
 */

import { t } from '@/lib/i18n';
import type { AuthorRow } from '@/auth';

/**
 * "Blocking" velden — account kan niet actief worden zolang één van deze
 * leeg is. Houdt admin-pill ("Persoonsgegevens toe te voegen") en
 * auteur-banner ("Vul je gegevens aan") consistent. Telefoon en
 * geboortedatum tellen NIET mee — die mogen later aangevuld worden.
 */
function hasBlockingMissingData(a: AuthorRow): boolean {
  const empty = (v: string | null): boolean => v === null || v.trim().length === 0;
  return (
    empty(a.first_name) ||
    empty(a.last_name) ||
    empty(a.street) ||
    empty(a.house_number) ||
    empty(a.postcode) ||
    empty(a.city) ||
    empty(a.bank_account) ||
    empty(a.bic) ||
    empty(a.bsn)
  );
}

const ICON_PENCIL =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

const ICON_CLOCK =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

export function buildOnboardingBanner(author: AuthorRow): HTMLElement | null {
  if (author.onboarding_status === 'active') {
    return null;
  }

  // Bepaal de variant + bijbehorende styling-modifier + iconen + i18n-keys.
  let variant: 'blocking' | 'softmissing' | 'review';
  if (author.onboarding_status === 'pending_admin_review') {
    variant = 'review';
  } else if (hasBlockingMissingData(author)) {
    variant = 'blocking';
  } else {
    variant = 'softmissing';
  }

  const wrap = document.createElement('section');
  wrap.className = `onboarding-banner onboarding-banner-${variant}`;
  wrap.setAttribute('role', 'status');

  const icon = document.createElement('div');
  icon.className = 'onboarding-banner-icon';
  icon.setAttribute('aria-hidden', 'true');
  // Statische SVG-strings uit eigen module — niet gebruiker-gegenereerd
  // eslint-disable-next-line no-unsanitized/property -- statische SVG uit code
  icon.innerHTML = variant === 'blocking' ? ICON_PENCIL : ICON_CLOCK;
  wrap.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'onboarding-banner-body';

  const title = document.createElement('h2');
  title.className = 'onboarding-banner-title';
  title.textContent = t(
    variant === 'blocking'
      ? 'onboarding.banner_blocking_title'
      : variant === 'softmissing'
        ? 'onboarding.banner_softmissing_title'
        : 'onboarding.banner_pending_review_title'
  );
  body.appendChild(title);

  const text = document.createElement('p');
  text.className = 'onboarding-banner-text';
  text.textContent = t(
    variant === 'blocking'
      ? 'onboarding.banner_blocking_text'
      : variant === 'softmissing'
        ? 'onboarding.banner_softmissing_text'
        : 'onboarding.banner_pending_review_text'
  );
  body.appendChild(text);

  wrap.appendChild(body);
  return wrap;
}
