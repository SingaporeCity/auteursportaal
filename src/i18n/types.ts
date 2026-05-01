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
  | 'auth.login.error_invalid'
  | 'auth.login.error_generic'
  | 'auth.login.admin_sso'
  | 'auth.login.admin_sso_disabled_notice'
  | 'auth.set_password.title'
  | 'auth.set_password.submit'
  | 'auth.logout'
  | 'auth.no_access.title'
  | 'auth.no_access.message'

  // Dashboard tabs
  | 'tabs.start'
  | 'tabs.payments'
  | 'tabs.contracts'
  | 'tabs.forecast'
  | 'tabs.expenses'
  | 'tabs.faq'
  | 'tabs.profile'

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

  // Payments tab
  | 'payments.title'
  | 'payments.empty'
  | 'payments.download'
  | 'payments.missing_pdf'

  // Contracts tab
  | 'contracts.title'
  | 'contracts.empty'
  | 'contracts.contact_text'

  // Forecast tab
  | 'forecast.title'
  | 'forecast.empty'
  | 'forecast.range_label'
  | 'forecast.disclaimer'

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

  // FAQ tab
  | 'faq.title'
  | 'faq.intro';

export type Translations = Record<TranslationKey, string>;
