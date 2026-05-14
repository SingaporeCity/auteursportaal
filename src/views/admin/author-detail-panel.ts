/**
 * Admin detail-paneel: slide-in zijpaneel met alle informatie over één
 * auteur — persoonsgegevens, accountgegevens en activiteit-timeline.
 *
 * Wordt geopend door op een author-card te klikken. Vervangt het patroon
 * waarbij alle acties + data direct op de card stonden (overvol bij
 * 3000 auteurs).
 *
 * Op desktop: rechter-paneel max 480px breed. Op mobile: full-screen sheet.
 *
 * @module views/admin/author-detail-panel
 */

import type { AuthorRow } from '@/auth';
import { t } from '@/lib/i18n';

interface PanelOptions {
  author: AuthorRow;
  /** Status-pill (door admin.ts gerenderd via buildStatusPill). */
  statusPill: HTMLElement;
  /** Eén primaire actie afhankelijk van de status (mag null zijn). */
  primaryAction?: { label: string; tooltip?: string; onClick: () => void } | null;
  /** Secundaire acties — getoond als list onder de primary. */
  secondaryActions?: { label: string; tooltip?: string; onClick: () => void }[];
  onClose: () => void;
}

export function openAuthorDetailPanel(opts: PanelOptions): void {
  if (document.querySelector('.author-detail-overlay') !== null) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'author-detail-overlay';

  const panel = document.createElement('aside');
  panel.className = 'author-detail-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `${opts.author.first_name} ${opts.author.last_name}`);
  overlay.appendChild(panel);

  panel.appendChild(buildHeader(opts));
  panel.appendChild(buildBody(opts.author));
  const actionsFooter = buildFooter(opts);
  if (actionsFooter !== null) {
    panel.appendChild(actionsFooter);
  }

  const close = (): void => {
    overlay.classList.add('author-detail-overlay--closing');
    panel.classList.add('author-detail-panel--closing');
    document.removeEventListener('keydown', escHandler);
    setTimeout(() => {
      overlay.remove();
      opts.onClose();
    }, 220);
  };
  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    }
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', escHandler);

  const closeBtn = panel.querySelector<HTMLButtonElement>('.author-detail-close');
  if (closeBtn !== null) {
    closeBtn.addEventListener('click', close);
  }

  document.body.appendChild(overlay);
  // Force reflow zodat de slide-in-animatie zichtbaar wordt
  panel.getBoundingClientRect();
  overlay.classList.add('author-detail-overlay--open');
  panel.classList.add('author-detail-panel--open');
}

function buildHeader(opts: PanelOptions): HTMLElement {
  const header = document.createElement('header');
  header.className = 'author-detail-header';

  const top = document.createElement('div');
  top.className = 'author-detail-top';

  const avatar = document.createElement('span');
  avatar.className = 'author-detail-avatar';
  const initials = computeInitials(opts.author.first_name, opts.author.last_name);
  avatar.textContent = initials;
  top.appendChild(avatar);

  const meta = document.createElement('div');
  meta.className = 'author-detail-meta';

  const name = document.createElement('h2');
  name.className = 'author-detail-name';
  name.textContent = `${opts.author.first_name} ${opts.author.last_name}`.trim();
  meta.appendChild(name);

  const email = document.createElement('span');
  email.className = 'author-detail-email';
  email.textContent = opts.author.email;
  meta.appendChild(email);

  top.appendChild(meta);

  // Status-pill rechts in de header
  opts.statusPill.classList.add('author-detail-status');
  top.appendChild(opts.statusPill);

  // Close-button uiterst rechts
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'author-detail-close';
  closeBtn.setAttribute('aria-label', t('admin.detail_close'));
  closeBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  top.appendChild(closeBtn);

  header.appendChild(top);
  return header;
}

function buildBody(author: AuthorRow): HTMLElement {
  const body = document.createElement('div');
  body.className = 'author-detail-body';

  body.appendChild(
    buildSection(t('admin.detail_section_persoonsgegevens'), [
      [t('profile.label_phone'), author.phone],
      [
        t('profile.label_address'),
        joinAddress(author.street, author.house_number, author.postcode, author.city),
      ],
      [t('profile.label_country'), author.country],
      [t('profile.label_birthdate'), formatDate(author.birth_date)],
      [t('profile.label_bsn'), author.bsn === null ? null : maskBsn(author.bsn)],
      [t('profile.label_iban'), author.bank_account],
      [t('profile.label_bic'), author.bic],
    ])
  );

  body.appendChild(
    buildSection(t('admin.detail_section_account'), [
      [t('profile.id_vendor'), author.netsuite_vendor_id],
      [t('profile.id_alliant'), author.alliant_id],
    ])
  );

  body.appendChild(buildActivityTimeline(author));

  return body;
}

function buildSection(title: string, rows: [string, string | null][]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'author-detail-section';

  const h = document.createElement('h3');
  h.className = 'author-detail-section-title';
  h.textContent = title;
  section.appendChild(h);

  const dl = document.createElement('dl');
  dl.className = 'author-detail-dl';

  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    dl.appendChild(dt);

    const dd = document.createElement('dd');
    if (value === null || value.trim() === '') {
      dd.textContent = t('admin.detail_empty_value');
      dd.classList.add('author-detail-dd-empty');
    } else {
      dd.textContent = value;
    }
    dl.appendChild(dd);
  }

  section.appendChild(dl);
  return section;
}

function buildActivityTimeline(author: AuthorRow): HTMLElement {
  const section = document.createElement('section');
  section.className = 'author-detail-section';

  const h = document.createElement('h3');
  h.className = 'author-detail-section-title';
  h.textContent = t('admin.detail_section_activity');
  section.appendChild(h);

  const events: { label: string; iso: string | null }[] = [
    { label: t('admin.detail_activity_created'), iso: author.created_at },
    { label: t('admin.detail_activity_invited'), iso: author.invited_at },
    { label: t('admin.detail_activity_submitted'), iso: author.data_submitted_at },
    { label: t('admin.detail_activity_reminder'), iso: author.reminder_sent_at },
    { label: t('admin.detail_activity_activated'), iso: author.activated_at },
  ].filter((e) => e.iso !== null);

  const ul = document.createElement('ul');
  ul.className = 'author-detail-timeline';
  for (const e of events) {
    const li = document.createElement('li');
    li.className = 'author-detail-timeline-item';

    const dot = document.createElement('span');
    dot.className = 'author-detail-timeline-dot';
    li.appendChild(dot);

    const inner = document.createElement('div');
    inner.className = 'author-detail-timeline-inner';

    const lbl = document.createElement('span');
    lbl.className = 'author-detail-timeline-label';
    lbl.textContent = e.label;
    inner.appendChild(lbl);

    const dt = document.createElement('span');
    dt.className = 'author-detail-timeline-date';
    dt.textContent = formatDate(e.iso) ?? '—';
    inner.appendChild(dt);

    li.appendChild(inner);
    ul.appendChild(li);
  }

  section.appendChild(ul);
  return section;
}

function buildFooter(opts: PanelOptions): HTMLElement | null {
  const hasPrimary = opts.primaryAction !== null && opts.primaryAction !== undefined;
  const secondaries = opts.secondaryActions ?? [];
  if (!hasPrimary && secondaries.length === 0) {
    return null;
  }

  const footer = document.createElement('footer');
  footer.className = 'author-detail-footer';

  if (hasPrimary && opts.primaryAction !== undefined && opts.primaryAction !== null) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'author-detail-primary';
    btn.textContent = opts.primaryAction.label;
    if (opts.primaryAction.tooltip !== undefined) {
      btn.title = opts.primaryAction.tooltip;
    }
    btn.addEventListener('click', () => {
      opts.primaryAction?.onClick();
    });
    footer.appendChild(btn);
  }

  for (const sec of secondaries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'author-detail-secondary';
    btn.textContent = sec.label;
    if (sec.tooltip !== undefined) {
      btn.title = sec.tooltip;
    }
    btn.addEventListener('click', () => {
      sec.onClick();
    });
    footer.appendChild(btn);
  }

  return footer;
}

function computeInitials(first: string, last: string): string {
  const f = first.trim()[0] ?? '';
  const l = last.trim()[0] ?? '';
  const initials = `${f}${l}`.toUpperCase();
  return initials === '' ? '·' : initials;
}

function joinAddress(
  street: string | null,
  houseNumber: string | null,
  postcode: string | null,
  city: string | null
): string | null {
  const line1 = [street, houseNumber].filter((v) => v !== null && v.trim() !== '').join(' ');
  const line2 = [postcode, city].filter((v) => v !== null && v.trim() !== '').join(' ');
  const joined = [line1, line2].filter((v) => v !== '').join(', ');
  return joined === '' ? null : joined;
}

function maskBsn(bsn: string): string {
  // BSN-nummers tonen we niet onversleuteld in admin-UI (audit-safe default).
  // Eerste drie cijfers + masker — herkenbaar genoeg om "ja ik weet welke
  // BSN dit is" zonder volledig nummer in DOM/screenshot te lekken.
  const trimmed = bsn.trim();
  if (trimmed.length <= 3) {
    return trimmed;
  }
  return `${trimmed.slice(0, 3)} ${'•'.repeat(Math.max(trimmed.length - 3, 4))}`;
}

function formatDate(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear())}`;
}
