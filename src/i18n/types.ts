/**
 * Type-definities voor het i18n-systeem.
 *
 * `TranslationKey` is de union van alle bekende vertaalsleutels. Wanneer je
 * een nieuwe key toevoegt aan `nl.ts`, voeg hem ook hier toe — TypeScript
 * verplicht dan dat `en.ts` en `sv.ts` dezelfde key hebben.
 *
 * @module i18n/types
 */

export const SUPPORTED_LOCALES = ['nl', 'en', 'sv'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'nl';
export const FALLBACK_LOCALE: SupportedLocale = 'nl';

/**
 * Centrale lijst van alle vertaalsleutels die in de UI gebruikt worden.
 * Wordt afgedwongen door TypeScript: ontbrekende keys in een taalbestand
 * leveren een compile-error.
 *
 * Volledige port van de oude TRANSLATIONS-keys gebeurt parallel met de
 * tab-migraties (Task #13). Voor nu: kernset voor auth, navigatie, profiel.
 */
export type TranslationKey =
  // Algemeen
  | 'app.title'
  | 'app.tagline'
  | 'common.loading'
  | 'common.save'
  | 'common.cancel'
  | 'common.edit'
  | 'common.delete'
  | 'common.search'
  | 'common.missing'

  // Auth
  | 'auth.login.title'
  | 'auth.login.subtitle'
  | 'auth.login.email_label'
  | 'auth.login.password_label'
  | 'auth.login.submit'
  | 'auth.login.forgot_password'
  | 'auth.login.forgot_back'
  | 'auth.login.forgot_sent'
  | 'auth.login.error_invalid'
  | 'auth.login.error_generic'
  | 'auth.login.brand_title'
  | 'auth.login.brand_subtitle'
  | 'auth.login.stat_years'
  | 'auth.login.stat_authors'
  | 'auth.login.stat_publications'
  | 'auth.set_password.title'
  | 'auth.set_password.submit'
  | 'auth.logout'
  | 'auth.no_access.title'
  | 'auth.no_access.message'

  // Header / shared
  | 'header.search_placeholder'
  | 'header.search_label'
  | 'header.app_label'

  // Command palette
  | 'cmd.placeholder'
  | 'cmd.no_results'
  | 'cmd.group_navigation'
  | 'cmd.group_payments'
  | 'cmd.group_contracts'
  | 'cmd.group_faq'
  | 'cmd.hint_open_tab'

  // PDF preview
  | 'pdf.download'
  | 'pdf.loading'

  // Dashboard tabs
  | 'tabs.start'
  | 'tabs.payments'
  | 'tabs.contracts'
  | 'tabs.forecast'
  | 'tabs.expenses'
  | 'tabs.faq'
  | 'tabs.profile'

  // Onboarding
  | 'onboarding.banner_pending_data_title'
  | 'onboarding.banner_pending_data_text'
  | 'onboarding.banner_pending_review_title'
  | 'onboarding.banner_pending_review_text'
  | 'onboarding.tab_disabled_tooltip'
  | 'onboarding.activate_button'
  | 'onboarding.activate_button_disabled_hint'
  | 'onboarding.activate_confirmation'
  | 'onboarding.save_intermediate'
  | 'onboarding.readonly_disclaimer'
  | 'onboarding.required_field_hint'
  | 'onboarding.missing_fields_count'
  | 'onboarding.progress_step1_label'
  | 'onboarding.progress_step2_label'
  | 'onboarding.progress_step3_label'
  | 'onboarding.tab_lock_short'

  // Profiel
  | 'profile.title'
  | 'profile.id_vendor'
  | 'profile.id_alliant'
  | 'profile.label_firstname'
  | 'profile.label_lastname'
  | 'profile.label_email'
  | 'profile.label_phone'
  | 'profile.label_address'
  | 'profile.label_postcode'
  | 'profile.label_city'
  | 'profile.label_country'
  | 'profile.label_birthdate'
  | 'profile.label_bsn'
  | 'profile.label_iban'
  | 'profile.label_bic'
  | 'profile.bsn_show'
  | 'profile.bsn_hide'
  | 'profile.bsn_immutable_hint'

  // Greeting
  | 'greeting.morning'
  | 'greeting.afternoon'
  | 'greeting.evening'
  | 'greeting.night'

  // Start tab
  | 'start.kpi.total_paid'
  | 'start.kpi.this_year'
  | 'start.kpi.statements_count'
  | 'start.kpi.last_payment'
  | 'start.recent_title'
  | 'start.events_title'
  | 'start.news_title'
  | 'start.year_review_badge'
  | 'start.total_since'
  | 'start.last_payment'
  | 'start.expected_next'
  | 'start.tba'
  | 'start.royalty_overview'
  | 'start.amounts_pending'
  | 'start.academy_label'
  | 'start.academy_desc'
  | 'start.paid_in_year'
  | 'start.expected_in_year'
  | 'start.yoy_vs'
  | 'start.on_date'
  | 'common.not_available_dash'

  // Payments tab
  | 'payments.title'
  | 'payments.empty'
  | 'payments.download'
  | 'payments.missing_pdf'
  | 'payments.search_placeholder'

  // Contracts tab
  | 'contracts.title'
  | 'contracts.empty'
  | 'contracts.contact_text'
  | 'contracts.search_placeholder'
  | 'contracts.stat_active'

  // Forecast tab
  | 'forecast.title'
  | 'forecast.empty'
  | 'forecast.range_label'
  | 'forecast.disclaimer'
  | 'forecast.pending_headline'
  | 'forecast.pending_sub_part1'
  | 'forecast.pending_sub_part2'
  | 'forecast.publish_date_label'
  | 'forecast.auto_notify'
  | 'forecast.history_title'
  | 'forecast.range_sub'
  | 'forecast.payout_label'
  | 'forecast.chart_title'
  | 'forecast.eyebrow_year'
  | 'forecast.payout_month'
  | 'forecast.bar_year_projection'

  // Expenses tab
  | 'expenses.title'
  | 'expenses.new_title'
  | 'expenses.field_description'
  | 'expenses.field_amount'
  | 'expenses.field_type'
  | 'expenses.field_receipt'
  | 'expenses.submit'
  | 'expenses.history_title'
  | 'expenses.history_empty'
  | 'expenses.status_pending'
  | 'expenses.status_approved'
  | 'expenses.status_rejected'
  | 'expenses.status_paid'
  | 'expenses.vendor_id_label'
  | 'expenses.rules_heading'
  | 'expenses.dropzone_text'
  | 'expenses.dropzone_hint'

  // FAQ tab
  | 'faq.title'
  | 'faq.intro'

  // Common
  | 'common.busy'
  | 'common.close'

  // Profile change-request flow
  | 'profile.changes_heading'
  | 'profile.changes_intro'
  | 'profile.changes_empty'
  | 'profile.changes_saved'
  | 'profile.changes_nothing'
  | 'profile.pending_change_badge'
  | 'profile.changes_submitted'

  // Admin — auteurs-overzicht
  | 'admin.section_overline'
  | 'admin.section_heading'
  | 'admin.empty_filter'
  | 'admin.toolbar_csv_import'
  | 'admin.toolbar_csv_export'
  | 'admin.toolbar_new_author'
  | 'admin.filter_all'
  | 'admin.filter_pending_review'
  | 'admin.filter_pending_data'
  | 'admin.filter_active'
  | 'admin.btn_send_invite'
  | 'admin.btn_send_reminder'
  | 'admin.btn_activate'
  | 'admin.btn_upload_statement'
  | 'admin.status_admin'
  | 'admin.status_pending_data'
  | 'admin.status_pending_review'
  | 'admin.status_active'
  | 'admin.reminder_in_days'
  | 'admin.invited_at'
  | 'admin.reminder_at'
  | 'admin.activated_at'

  // Admin — nieuwe auteur form
  | 'admin.new_author_heading'
  | 'admin.new_author_intro'
  | 'admin.new_author_field_email'
  | 'admin.new_author_field_firstname'
  | 'admin.new_author_field_lastname'
  | 'admin.new_author_field_vendor'
  | 'admin.new_author_submit'

  // Admin — CSV import
  | 'admin.csv_import_heading'
  | 'admin.csv_import_intro'
  | 'admin.csv_import_file_label'
  | 'admin.csv_import_mode_legend'
  | 'admin.csv_import_mode_create_only'
  | 'admin.csv_import_mode_upsert'
  | 'admin.csv_import_submit'
  | 'admin.csv_import_close'
  | 'admin.csv_import_stat_created'
  | 'admin.csv_import_stat_updated'
  | 'admin.csv_import_stat_skipped'
  | 'admin.csv_import_stat_bsn_skipped'
  | 'admin.csv_import_errors_heading'

  // Admin — CSV export
  | 'admin.csv_export_heading'
  | 'admin.csv_export_intro'
  | 'admin.csv_export_reason_label'
  | 'admin.csv_export_reason_placeholder'
  | 'admin.csv_export_submit_count'
  | 'admin.csv_export_submit'
  | 'admin.csv_export_no_changes'
  | 'admin.csv_export_summary_count'
  | 'admin.csv_export_row_more'
  | 'admin.csv_export_success_heading'
  | 'admin.csv_export_success_text'
  | 'admin.csv_export_row_new'
  | 'admin.csv_export_row_changed'

  // Admin — statement upload
  | 'admin.statement_upload_heading'
  | 'admin.statement_upload_field_type'
  | 'admin.statement_upload_field_file'
  | 'admin.statement_upload_submit'
  | 'admin.statement_upload_busy'

  // Admin — change requests
  | 'admin.changes_heading'
  | 'admin.changes_empty'
  | 'admin.changes_approve'
  | 'admin.changes_reject';

export type Translations = Record<TranslationKey, string>;
