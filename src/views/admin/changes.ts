/**
 * Admin: lijst pending wijzigingsverzoeken + goedkeuren/afwijzen.
 *
 * Goedkeuren past de change toe op het authors-record en markeert het
 * verzoek als `approved` (met processed_by + processed_at). Afwijzen
 * markeert alleen `rejected` zonder de waarde toe te passen.
 *
 * @module views/admin/changes
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { formatDate } from '@/lib/format';
import type { Database } from '@/types/db';

type ChangeRequestRow = Database['public']['Tables']['change_requests']['Row'];
type AuthorRow = Database['public']['Tables']['authors']['Row'];

export async function renderChangesSection(
  container: HTMLElement,
  adminId: string,
  onUpdate: () => void
): Promise<void> {
  const heading = document.createElement('h3');
  heading.textContent = 'Wachtende wijzigingsverzoeken';
  container.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'changes-list';
  list.textContent = '…';
  container.appendChild(list);

  await loadAndRender(list, adminId, onUpdate);
}

async function loadAndRender(
  container: HTMLElement,
  adminId: string,
  onUpdate: () => void
): Promise<void> {
  const { data: changes, error } = await supabase
    .from('change_requests')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });

  container.replaceChildren();

  if (error !== null) {
    reportError('admin.changes.load', error);
    container.textContent = `Fout: ${error.message}`;
    return;
  }

  if (changes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Geen wachtende verzoeken.';
    container.appendChild(empty);
    return;
  }

  // Auteur-info apart ophalen om PostgREST FK-disambiguation te vermijden
  const authorIds = [...new Set(changes.map((c) => c.author_id))];
  const { data: authors } = await supabase
    .from('authors')
    .select('id, first_name, last_name, email')
    .in('id', authorIds);

  const authorMap = new Map<string, { first_name: string; last_name: string; email: string }>();
  authors?.forEach((a) => authorMap.set(a.id, a));

  changes.forEach((cr) => {
    const enriched: ChangeRequestWithAuthor = {
      ...cr,
      authors: authorMap.get(cr.author_id) ?? null,
    };
    container.appendChild(renderChangeRow(enriched, adminId, onUpdate));
  });
}

interface ChangeRequestWithAuthor extends ChangeRequestRow {
  authors: { first_name: string; last_name: string; email: string } | null;
}

function renderChangeRow(
  cr: ChangeRequestWithAuthor,
  adminId: string,
  onUpdate: () => void
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'change-row';

  const main = document.createElement('div');
  main.className = 'change-main';

  const who = document.createElement('div');
  who.className = 'change-who';
  who.textContent = cr.authors ? `${cr.authors.first_name} ${cr.authors.last_name}` : 'Onbekend';
  main.appendChild(who);

  const what = document.createElement('div');
  what.className = 'change-what';
  what.textContent = `${cr.field_name}: "${cr.old_value ?? '—'}" → "${cr.new_value ?? '—'}"`;
  main.appendChild(what);

  const when = document.createElement('div');
  when.className = 'change-when';
  when.textContent = `Aangevraagd ${formatDate(cr.requested_at)}`;
  main.appendChild(when);

  row.appendChild(main);

  const approveBtn = document.createElement('button');
  approveBtn.type = 'button';
  approveBtn.className = 'change-approve';
  approveBtn.textContent = 'Goedkeuren';
  approveBtn.addEventListener('click', () => {
    void approve(cr, adminId, approveBtn, onUpdate);
  });

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'change-reject';
  rejectBtn.textContent = 'Afwijzen';
  rejectBtn.addEventListener('click', () => {
    void reject(cr, adminId, rejectBtn, onUpdate);
  });

  row.appendChild(approveBtn);
  row.appendChild(rejectBtn);
  return row;
}

const ALLOWED_FIELDS = new Set([
  'first_name',
  'last_name',
  'email',
  'phone',
  'street',
  'house_number',
  'postcode',
  'city',
  'country',
  'bank_account',
  'bic',
  'birth_date',
  'bsn',
  'initials',
]);

async function approve(
  cr: ChangeRequestRow,
  adminId: string,
  btn: HTMLButtonElement,
  onUpdate: () => void
): Promise<void> {
  if (!ALLOWED_FIELDS.has(cr.field_name)) {
    reportError(
      'admin.changes.approve',
      new Error(`field_name "${cr.field_name}" niet toegestaan`)
    );
    return;
  }

  btn.disabled = true;

  // 1. Pas wijziging toe op authors-record
  const update: Partial<AuthorRow> = { [cr.field_name]: cr.new_value };
  const { error: updateError } = await supabase
    .from('authors')
    .update(update)
    .eq('id', cr.author_id);

  if (updateError !== null) {
    reportError('admin.changes.applyToAuthor', updateError);
    btn.disabled = false;
    return;
  }

  // 2. Markeer change_request als approved
  const { error: crError } = await supabase
    .from('change_requests')
    .update({
      status: 'approved',
      processed_at: new Date().toISOString(),
      processed_by: adminId,
    })
    .eq('id', cr.id);

  if (crError !== null) {
    reportError('admin.changes.markApproved', crError);
    btn.disabled = false;
    return;
  }

  onUpdate();
}

async function reject(
  cr: ChangeRequestRow,
  adminId: string,
  btn: HTMLButtonElement,
  onUpdate: () => void
): Promise<void> {
  btn.disabled = true;
  // eslint-disable-next-line no-alert -- MVP: vervangen door modal-prompt in latere iteratie
  const reason = window.prompt('Reden afwijzing (optioneel):') ?? '';

  const { error } = await supabase
    .from('change_requests')
    .update({
      status: 'rejected',
      processed_at: new Date().toISOString(),
      processed_by: adminId,
      rejection_reason: reason.trim().length > 0 ? reason.trim() : null,
    })
    .eq('id', cr.id);

  if (error !== null) {
    reportError('admin.changes.reject', error);
    btn.disabled = false;
    return;
  }

  onUpdate();
}
