/**
 * Profiel-tab: read-only weergave van de auteur. Ontbrekende velden worden
 * getoond als "ontbreekt" — geen placeholder-data.
 *
 * Bewerken loopt straks via een change-request flow (admin-approval); voor
 * nu is de tab puur tonend zodat we de RLS-isolatie kunnen verifiëren.
 *
 * @module views/tabs/profile
 */

import type { AuthorRow } from '@/auth';
import { t } from '@/lib/i18n';
import { formatBSNMasked, formatIBAN, formatPhoneNL, formatDate } from '@/lib/format';

interface FieldRow {
  labelKey: Parameters<typeof t>[0];
  value: string;
}

export function renderProfileTab(container: HTMLElement, author: AuthorRow): void {
  const heading = document.createElement('h2');
  heading.textContent = t('profile.title');
  container.appendChild(heading);

  // ID-banner (Vendor + Alliant)
  const banner = document.createElement('div');
  banner.className = 'id-banner';
  banner.appendChild(idChip('profile.id_vendor', author.netsuite_vendor_id));
  banner.appendChild(idChip('profile.id_alliant', author.alliant_id));
  container.appendChild(banner);

  const grid = document.createElement('div');
  grid.className = 'profile-grid';

  const rows: FieldRow[] = [
    { labelKey: 'profile.label_firstname', value: author.first_name },
    { labelKey: 'profile.label_lastname', value: author.last_name },
    { labelKey: 'profile.label_email', value: author.email },
    { labelKey: 'profile.label_phone', value: optional(author.phone, formatPhoneNL) },
    {
      labelKey: 'profile.label_address',
      value: combineAddress(author.street, author.house_number),
    },
    { labelKey: 'profile.label_postcode', value: author.postcode ?? '' },
    { labelKey: 'profile.label_city', value: author.city ?? '' },
    { labelKey: 'profile.label_country', value: author.country },
    { labelKey: 'profile.label_birthdate', value: optional(author.birth_date, formatDate) },
    { labelKey: 'profile.label_bsn', value: optional(author.bsn, formatBSNMasked) },
    { labelKey: 'profile.label_iban', value: optional(author.bank_account, formatIBAN) },
    { labelKey: 'profile.label_bic', value: author.bic ?? '' },
  ];

  rows.forEach((row) => {
    grid.appendChild(buildRow(row));
  });
  container.appendChild(grid);
}

function idChip(labelKey: Parameters<typeof t>[0], value: string | null): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'id-chip';

  const label = document.createElement('span');
  label.className = 'id-chip-label';
  label.textContent = t(labelKey);

  const val = document.createElement('span');
  val.className = 'id-chip-value';
  val.textContent = value !== null && value !== '' ? value : t('common.missing');

  chip.appendChild(label);
  chip.appendChild(val);
  return chip;
}

function buildRow(row: FieldRow): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'profile-row';

  const label = document.createElement('div');
  label.className = 'profile-label';
  label.textContent = t(row.labelKey);

  const value = document.createElement('div');
  value.className = 'profile-value';
  if (row.value === '') {
    value.classList.add('profile-missing');
    value.textContent = t('common.missing');
  } else {
    value.textContent = row.value;
  }

  wrap.appendChild(label);
  wrap.appendChild(value);
  return wrap;
}

function combineAddress(street: string | null, houseNumber: string | null): string {
  if (street === null || street === '') {
    return '';
  }
  if (houseNumber === null || houseNumber === '') {
    return street;
  }
  return `${street} ${houseNumber}`;
}

function optional(value: string | null, formatter: (s: string) => string): string {
  if (value === null || value === '') {
    return '';
  }
  return formatter(value);
}
