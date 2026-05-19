/**
 * Client-wrapper voor de `delete-author` Edge Function.
 *
 * Vertaalt server-side error-codes naar leesbare i18n-meldingen zodat de
 * UI (confirm-modal) direct kan tonen wat er fout ging.
 *
 * @module lib/delete-author
 */

import { supabase } from '@/lib/supabase';
import { extractFnError } from '@/lib/edge-function-errors';
import { t } from '@/lib/i18n';

export interface DeleteAuthorResult {
  success: boolean;
  deleted?: {
    storage_files: number;
    authors_row: boolean;
    auth_user: boolean;
  };
  warnings?: {
    storage_errors?: string[];
    auth_error?: string | null;
  };
}

/**
 * Roept de Edge Function aan en gooit een Error met i18n-tekst bij faal.
 * Caller (confirm-modal) vangt die op en toont 'm in-modal.
 */
export async function deleteAuthor(authorId: string): Promise<DeleteAuthorResult> {
  const result = await supabase.functions.invoke<DeleteAuthorResult>('delete-author', {
    body: { authorId },
  });

  if (result.error !== null && result.error !== undefined) {
    const extracted = await extractFnError(result.error);
    const code = extracted?.message ?? '';
    if (code === 'cannot_delete_self') {
      throw new Error(t('admin.delete_author_error_self'));
    }
    // Generieke fallback: geef raw bericht door zodat ontwikkelaar bij
    // onverwachte status (500 / network) iets aanknopingsbaars ziet.
    const detail =
      extracted !== null
        ? `${t('admin.delete_author_error')}: ${extracted.message}`
        : t('admin.delete_author_error');
    throw new Error(detail);
  }

  if (result.data === null) {
    throw new Error(t('admin.delete_author_error'));
  }
  return result.data;
}
