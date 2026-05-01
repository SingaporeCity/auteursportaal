/**
 * Admin-pagina: hoofdview met
 *  - Pending wijzigingsverzoeken (bovenaan, alle auteurs)
 *  - Auteurslijst met inline expand: Activeer + Statement-upload
 *  - "Nieuwe auteur"-form
 *
 * @module views/admin
 */

import type { AuthorRow } from '@/auth';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { renderChangesSection } from './admin/changes';
import { buildStatementUploadForm } from './admin/statement-upload';
import { buildAppHeader } from './shared/header';

export function renderAdminView(root: HTMLElement, admin: AuthorRow): void {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'app-shell';
  layout.appendChild(buildAppHeader(`${admin.first_name} ${admin.last_name} (admin)`));

  const main = document.createElement('main');
  main.className = 'admin-content';
  layout.appendChild(main);

  // -- Pending change_requests (bovenaan, herlaadt zichzelf na elke approve/reject)
  const changesWrapper = document.createElement('section');
  changesWrapper.className = 'admin-section';
  main.appendChild(changesWrapper);
  const refreshChanges = (): void => {
    changesWrapper.replaceChildren();
    void renderChangesSection(changesWrapper, admin.id, refreshChanges);
  };
  refreshChanges();

  // -- Auteurslijst sectie
  const heading = document.createElement('h2');
  heading.textContent = 'Auteursbeheer';
  main.appendChild(heading);

  const statusBox = document.createElement('div');
  statusBox.className = 'admin-status';
  statusBox.hidden = true;
  main.appendChild(statusBox);

  const newAuthorBtn = document.createElement('button');
  newAuthorBtn.type = 'button';
  newAuthorBtn.className = 'admin-action';
  newAuthorBtn.textContent = '+ Nieuwe auteur';
  main.appendChild(newAuthorBtn);

  const list = document.createElement('div');
  list.className = 'admin-author-list';
  list.textContent = 'Laden…';
  main.appendChild(list);

  newAuthorBtn.addEventListener('click', () => {
    openNewAuthorForm(main, list, statusBox);
  });

  void loadAuthors(list, statusBox);
  root.appendChild(layout);
}

async function loadAuthors(container: HTMLElement, statusBox: HTMLElement): Promise<void> {
  const { data, error } = await supabase
    .from('authors')
    .select('*')
    .order('last_name', { ascending: true });

  container.replaceChildren();

  if (error !== null) {
    reportError('admin.loadAuthors', error);
    container.textContent = `Fout: ${error.message}`;
    return;
  }

  if (data.length === 0) {
    container.textContent = 'Geen auteurs gevonden.';
    return;
  }

  data.forEach((author) => {
    container.appendChild(renderAuthorCard(author, container, statusBox));
  });
}

function renderAuthorCard(
  author: AuthorRow,
  listContainer: HTMLElement,
  statusBox: HTMLElement
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'admin-author-card';

  const row = document.createElement('div');
  row.className = 'admin-author-row';

  const main = document.createElement('div');
  main.className = 'admin-author-main';

  const name = document.createElement('div');
  name.className = 'admin-author-name';
  name.textContent = `${author.first_name} ${author.last_name}`;
  main.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'admin-author-meta';
  const parts: string[] = [author.email];
  if (author.netsuite_vendor_id !== null) {
    parts.push(`Vendor ${author.netsuite_vendor_id}`);
  }
  meta.textContent = parts.join(' · ');
  main.appendChild(meta);

  row.appendChild(main);

  // Actie-knoppen rechts
  if (!author.is_admin && !author.is_active) {
    const activateBtn = document.createElement('button');
    activateBtn.type = 'button';
    activateBtn.className = 'admin-activate';
    activateBtn.textContent = 'Activeer';
    activateBtn.addEventListener('click', () => {
      void activate(author, activateBtn, listContainer, statusBox);
    });
    row.appendChild(activateBtn);
  }

  if (!author.is_admin) {
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'admin-expand';
    expandBtn.textContent = 'Statement uploaden';
    expandBtn.addEventListener('click', () => {
      toggleUploadPanel(card, author);
    });
    row.appendChild(expandBtn);
  }

  const status = document.createElement('span');
  status.className = 'admin-author-status';
  if (author.is_admin) {
    status.textContent = 'admin';
    status.classList.add('status-admin');
  } else if (author.is_active) {
    status.textContent = 'actief';
    status.classList.add('status-active');
  } else {
    status.textContent = 'inactief';
    status.classList.add('status-inactive');
  }
  row.appendChild(status);

  card.appendChild(row);
  return card;
}

function toggleUploadPanel(card: HTMLElement, author: AuthorRow): void {
  const existing = card.querySelector('.admin-upload-panel');
  if (existing !== null) {
    existing.remove();
    return;
  }
  const panel = document.createElement('div');
  panel.className = 'admin-upload-panel';
  panel.appendChild(
    buildStatementUploadForm(author, () => {
      panel.remove();
    })
  );
  card.appendChild(panel);
}

async function activate(
  author: AuthorRow,
  btn: HTMLButtonElement,
  listContainer: HTMLElement,
  statusBox: HTMLElement
): Promise<void> {
  btn.disabled = true;
  btn.textContent = '…';

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session === null) {
    reportError('admin.activate', new Error('geen sessie'));
    btn.disabled = false;
    btn.textContent = 'Activeer';
    return;
  }

  const result = await supabase.functions.invoke<{ ok?: boolean }>('create-accounts', {
    body: { author_id: author.id, email: author.email },
  });
  const errVal: unknown = result.error;
  let fnError: Error | null = null;
  if (errVal instanceof Error) {
    fnError = errVal;
  } else if (typeof errVal === 'string') {
    fnError = new Error(errVal);
  } else if (errVal !== null && errVal !== undefined) {
    fnError = new Error('Edge Function call failed');
  }

  if (fnError !== null) {
    reportError('admin.activate', fnError);
    btn.disabled = false;
    btn.textContent = 'Activeer';
    showStatus(
      statusBox,
      'error',
      `Activatie faalde: ${fnError.message} (Edge Function nog niet gedeployed — Task #17)`
    );
    return;
  }

  showStatus(statusBox, 'success', `${author.email} ontvangt een set-password mail.`);
  void loadAuthors(listContainer, statusBox);
}

interface NewAuthorValues {
  email: string;
  first_name: string;
  last_name: string;
  netsuite_vendor_id: string | null;
}

function openNewAuthorForm(parent: HTMLElement, list: HTMLElement, statusBox: HTMLElement): void {
  const existing = parent.querySelector('.admin-new-author-form');
  if (existing !== null) {
    existing.remove();
    return;
  }

  const form = document.createElement('form');
  form.className = 'admin-new-author-form';

  const emailField = labeledInput('email', 'E-mail', 'email', true);
  const firstNameField = labeledInput('first_name', 'Voornaam', 'text', true);
  const lastNameField = labeledInput('last_name', 'Achternaam', 'text', true);
  const vendorField = labeledInput('netsuite_vendor_id', 'Vendor ID', 'text', false);

  form.appendChild(emailField.field);
  form.appendChild(firstNameField.field);
  form.appendChild(lastNameField.field);
  form.appendChild(vendorField.field);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = 'Aanmaken';
  form.appendChild(submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const vendorRaw = vendorField.input.value.trim();
    const values: NewAuthorValues = {
      email: emailField.input.value.trim(),
      first_name: firstNameField.input.value.trim(),
      last_name: lastNameField.input.value.trim(),
      netsuite_vendor_id: vendorRaw.length > 0 ? vendorRaw : null,
    };
    void createAuthor(values, form, list, statusBox);
  });

  parent.appendChild(form);
}

async function createAuthor(
  values: NewAuthorValues,
  form: HTMLFormElement,
  list: HTMLElement,
  statusBox: HTMLElement
): Promise<void> {
  const { error } = await supabase.from('authors').insert({
    ...values,
    is_admin: false,
    is_active: false,
  });

  if (error !== null) {
    reportError('admin.createAuthor', error);
    showStatus(statusBox, 'error', `Aanmaken faalde: ${error.message}`);
    return;
  }

  form.remove();
  showStatus(
    statusBox,
    'success',
    `${values.email} aangemaakt — upload statements en klik 'Activeer' om de mail te triggeren.`
  );
  void loadAuthors(list, statusBox);
}

function labeledInput(
  name: string,
  label: string,
  type: 'text' | 'email',
  required: boolean
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'auth-field';

  const span = document.createElement('span');
  span.textContent = label;
  field.appendChild(span);

  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  if (required) {
    input.required = true;
  }
  field.appendChild(input);

  return { field, input };
}

function showStatus(box: HTMLElement, kind: 'error' | 'success', message: string): void {
  box.className = `admin-status admin-status-${kind}`;
  box.textContent = message;
  box.hidden = false;
}
