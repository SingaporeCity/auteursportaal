/**
 * PDF preview modal — opent een fullscreen overlay met de PDF in `<iframe>`.
 *
 * Gebruikt voor afrekeningen, contracten en jaaropgaves. De download-knop in
 * de modal-header genereert opnieuw een signed URL en triggert downloaden.
 *
 * @module views/shared/pdf-preview
 */

import { supabase } from '@/lib/supabase';
import { reportError } from '@/dev/debug-panel';
import { t } from '@/lib/i18n';

export interface PreviewOptions {
  filePath: string;
  title: string;
  subtitle?: string | undefined;
}

export async function openPdfPreview({ filePath, title, subtitle }: PreviewOptions): Promise<void> {
  const { data, error } = await supabase.storage.from('statements').createSignedUrl(filePath, 300);

  if (error !== null) {
    reportError('pdfPreview.signedUrl', error);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay pdf-preview-overlay';

  const modal = document.createElement('div');
  modal.className = 'pdf-preview-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  overlay.appendChild(modal);

  // Header
  const header = document.createElement('div');
  header.className = 'pdf-preview-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'pdf-preview-title-wrap';

  const titleEl = document.createElement('div');
  titleEl.className = 'pdf-preview-title';
  titleEl.textContent = title;
  titleWrap.appendChild(titleEl);

  if (subtitle !== undefined) {
    const subEl = document.createElement('div');
    subEl.className = 'pdf-preview-subtitle';
    subEl.textContent = subtitle;
    titleWrap.appendChild(subEl);
  }
  header.appendChild(titleWrap);

  const actions = document.createElement('div');
  actions.className = 'pdf-preview-actions';

  const downloadBtn = document.createElement('a');
  downloadBtn.className = 'pdf-preview-download';
  downloadBtn.href = data.signedUrl;
  downloadBtn.target = '_blank';
  downloadBtn.rel = 'noopener noreferrer';
  downloadBtn.textContent = t('pdf.download');
  actions.appendChild(downloadBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pdf-preview-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Sluiten');
  actions.appendChild(closeBtn);

  header.appendChild(actions);
  modal.appendChild(header);

  // Body — iframe met PDF
  const body = document.createElement('div');
  body.className = 'pdf-preview-body';

  const loading = document.createElement('div');
  loading.className = 'pdf-preview-loading';
  loading.textContent = t('pdf.loading');
  body.appendChild(loading);

  const iframe = document.createElement('iframe');
  iframe.className = 'pdf-preview-iframe';
  iframe.src = data.signedUrl;
  iframe.title = title;
  iframe.addEventListener('load', () => {
    loading.remove();
  });
  body.appendChild(iframe);

  modal.appendChild(body);

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    document.body.style.overflow = '';
  };

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  const escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
    }
  };
  document.addEventListener('keydown', escHandler);

  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
}
