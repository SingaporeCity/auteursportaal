import type { Translations } from './types';

/**
 * Zweedse vertalingen.
 *
 * NOTE: Eerste set is een conceptvertaling — laat een native speaker de UI
 * doorlopen voordat we naar productie gaan. Voor sleutels die nog niet
 * vertaald zijn vallen we automatisch terug op NL via `t()`.
 */
export const sv: Translations = {
  'app.title': 'Författarportal',
  'app.tagline': 'Direkt insyn i dina royalties, avräkningar och prognoser.',
  'common.loading': 'Laddar…',
  'common.save': 'Spara',
  'common.cancel': 'Avbryt',
  'common.edit': 'Redigera',
  'common.delete': 'Ta bort',
  'common.search': 'Sök',
  'common.missing': 'saknas',

  'auth.login.title': 'Välkommen till Noordhoff',
  'auth.login.subtitle': 'Logga in för att se din royaltyinformation',
  'auth.login.email_label': 'E-postadress',
  'auth.login.password_label': 'Lösenord',
  'auth.login.submit': 'Logga in',
  'auth.login.forgot_password': 'Glömt lösenord?',
  'auth.login.error_invalid': 'Ogiltig e-postadress eller lösenord.',
  'auth.login.error_generic': 'Något gick fel. Försök igen.',
  'auth.login.admin_sso': 'Logga in som administratör via Microsoft',
  'auth.login.admin_sso_disabled_notice':
    'Microsoft-inloggning är inte konfigurerad än. Detta aktiveras av Infinitas IT.',
  'auth.set_password.title': 'Ange ditt lösenord',
  'auth.set_password.submit': 'Spara lösenord',
  'auth.logout': 'Logga ut',
  'auth.no_access.title': 'Ingen åtkomst',
  'auth.no_access.message':
    'Detta konto har ingen åtkomst till författarportalen. Kontakta Noordhoff.',

  'tabs.start': 'Start',
  'tabs.payments': 'Avräkningar',
  'tabs.contracts': 'Kontrakt',
  'tabs.forecast': 'Prognos',
  'tabs.expenses': 'Utgifter',
  'tabs.faq': 'FAQ',
  'tabs.profile': 'Profil',

  'profile.title': 'Dina uppgifter',
  'profile.id_vendor': 'Vendor ID',
  'profile.id_alliant': 'Alliant ID',
  'profile.label_firstname': 'Förnamn',
  'profile.label_lastname': 'Efternamn',
  'profile.label_email': 'E-postadress',
  'profile.label_phone': 'Telefonnummer',
  'profile.label_address': 'Adress',
  'profile.label_postcode': 'Postnummer',
  'profile.label_city': 'Ort',
  'profile.label_country': 'Land',
  'profile.label_birthdate': 'Födelsedatum',
  'profile.label_bsn': 'BSN',
  'profile.label_iban': 'IBAN',
  'profile.label_bic': 'BIC',

  'greeting.morning': 'God morgon',
  'greeting.afternoon': 'God eftermiddag',
  'greeting.evening': 'God kväll',
  'greeting.night': 'God natt',

  'start.kpi.total_paid': 'Totalt utbetalt',
  'start.kpi.this_year': 'Detta år',
  'start.kpi.statements_count': 'Antal avräkningar',
  'start.kpi.last_payment': 'Senaste avräkning',
  'start.recent_title': 'Senaste avräkningar',

  'payments.title': 'Royaltyavräkningar',
  'payments.empty': 'Inga avräkningar tillgängliga.',
  'payments.download': 'Ladda ner',
  'payments.missing_pdf': 'PDF saknas',

  'contracts.title': 'Dina kontrakt',
  'contracts.empty': 'Inga kontrakt registrerade.',
  'contracts.contact_text': 'För frågor om ditt kontrakt, vänligen kontakta rights@noordhoff.nl.',

  'forecast.title': 'Förväntade royalties',
  'forecast.empty': 'Ingen prognos tillgänglig.',
  'forecast.range_label': 'Förväntat belopp',
  'forecast.disclaimer':
    'Indikativ prognos. Det faktiska beloppet kan avvika baserat på slutliga försäljningssiffror och kontraktsändringar.',

  'expenses.title': 'Utgifter',
  'expenses.new_title': 'Skicka in en ny utgift',
  'expenses.field_description': 'Beskrivning',
  'expenses.field_amount': 'Belopp (€)',
  'expenses.field_type': 'Typ',
  'expenses.field_receipt': 'Kvitto (PDF)',
  'expenses.submit': 'Skicka in',
  'expenses.history_title': 'Inskickade utgifter',
  'expenses.history_empty': 'Du har inte skickat in några utgifter ännu.',
  'expenses.status_pending': 'Väntande',
  'expenses.status_approved': 'Godkänd',
  'expenses.status_rejected': 'Avvisad',
  'expenses.status_paid': 'Betald',

  'faq.title': 'Vanliga frågor',
  'faq.intro': 'Svar på de vanligaste frågorna om royalties, kontrakt och portalen.',
};
