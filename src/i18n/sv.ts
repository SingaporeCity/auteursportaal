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
  'auth.login.forgot_submit': 'Återställ lösenord',
  'auth.login.forgot_back': '← tillbaka till inloggning',
  'auth.login.forgot_sent':
    'Om denna e-postadress finns hos oss får du en länk inom några minuter för att ange ett nytt lösenord.',
  'auth.login.error_invalid': 'Ogiltig e-postadress eller lösenord.',
  'auth.login.error_generic': 'Något gick fel. Försök igen.',
  'auth.login.brand_title': 'Författarportal',
  'auth.login.brand_subtitle':
    'Insyn i dina royalties, kontrakt och avräkningar, när och var som helst.',
  'auth.login.stat_years': 'års erfarenhet',
  'auth.login.stat_authors': 'aktiva författare',
  'auth.login.stat_publications': 'publikationer',
  'auth.set_password.title': 'Ange ditt lösenord',
  'auth.set_password.submit': 'Spara lösenord',
  'auth.logout': 'Logga ut',

  'auth.force_password.title': 'Välj ett eget lösenord',
  'auth.force_password.intro':
    'Välkommen! Du är inloggad med startlösenordet från Noordhoff. Välj nu ett eget lösenord för att fortsätta.',
  'auth.force_password.field_new': 'Nytt lösenord',
  'auth.force_password.field_confirm': 'Bekräfta lösenord',
  'auth.force_password.hint': 'Minst {min} tecken. Blanda bokstäver, siffror och skiljetecken.',
  'auth.force_password.submit': 'Spara lösenord',
  'auth.force_password.error_too_short': 'Lösenordet måste vara minst {min} tecken.',
  'auth.force_password.error_mismatch': 'Lösenorden stämmer inte överens.',
  'auth.force_password.error_same_as_initial':
    'Välj ett lösenord som skiljer sig från startlösenordet.',
  'auth.force_password.error_generic': 'Det gick inte att spara lösenordet. Försök igen.',
  'auth.force_password.error_flag_failed':
    'Lösenordet har sparats men statusen kunde inte uppdateras. Ladda om sidan.',

  'auth.mfa_enroll.title': 'Konfigurera tvåfaktorsautentisering',
  'auth.mfa_enroll.intro':
    'Säkra ditt konto med ett extra steg. Installera en autentiseringsapp (t.ex. Google Authenticator, Microsoft Authenticator, Authy eller 1Password), skanna QR-koden och ange den 6-siffriga koden.',
  'auth.mfa_enroll.step_scan': '1. Skanna QR-koden med din autentiseringsapp',
  'auth.mfa_enroll.qr_alt': 'QR-kod för autentiseringsapp',
  'auth.mfa_enroll.manual_label': 'Kan du inte skanna? Ange denna kod manuellt:',
  'auth.mfa_enroll.step_verify': '2. Ange den 6-siffriga koden som visas i din app',
  'auth.mfa_enroll.code_label': 'Verifieringskod (6 siffror)',
  'auth.mfa_enroll.submit': 'Bekräfta & aktivera',
  'auth.mfa_enroll.error_enroll':
    '2FA-konfigurationen misslyckades. Försök igen eller logga ut och in.',
  'auth.mfa_enroll.error_challenge': 'Kunde inte starta verifieringen. Försök igen.',
  'auth.mfa_enroll.error_code_format': 'Ange 6 siffror.',
  'auth.mfa_enroll.error_invalid_code':
    'Felaktig kod. Kontrollera din autentiseringsapp och försök igen.',

  'auth.mfa_challenge.title': 'Tvåfaktorsverifiering',
  'auth.mfa_challenge.intro': 'Ange den 6-siffriga koden från din autentiseringsapp.',
  'auth.mfa_challenge.code_label': 'Verifieringskod',
  'auth.mfa_challenge.submit': 'Logga in',
  'auth.mfa_challenge.error_code_format': 'Ange 6 siffror.',
  'auth.mfa_challenge.error_invalid_code': 'Felaktig kod. Försök igen.',
  'auth.mfa_challenge.error_generic': 'Verifieringen misslyckades. Försök igen.',
  'auth.no_access.title': 'Ingen åtkomst',
  'auth.no_access.message':
    'Detta konto har ingen åtkomst till författarportalen. Kontakta Noordhoff.',

  'header.search_placeholder': 'Sök flikar, avräkningar, kontrakt, FAQ…',
  'header.search_label': 'Sök…',
  'header.app_label': 'Författarportal',

  'cmd.placeholder': 'Sök flikar, avräkningar, kontrakt, FAQ…',
  'cmd.no_results': 'Inga resultat',
  'cmd.group_navigation': 'Navigation',
  'cmd.group_payments': 'Avräkningar',
  'cmd.group_contracts': 'Kontrakt',
  'cmd.group_faq': 'FAQ',
  'cmd.hint_open_tab': 'Öppna flik',

  'pdf.download': 'Ladda ner',
  'pdf.loading': 'Laddar PDF…',

  'tabs.start': 'Start',
  'tabs.payments': 'Avräkningar',
  'tabs.contracts': 'Kontrakt',
  'tabs.forecast': 'Prognos',
  'tabs.expenses': 'Utgifter',
  'tabs.faq': 'FAQ',
  'tabs.profile': 'Profil',

  'onboarding.banner_pending_data_title': 'Välkommen till din författarportal',
  'onboarding.banner_pending_data_text':
    'Komplettera din profil nedan så att Noordhoff kan aktivera ditt konto. De övriga delarna av portalen visas automatiskt när din ansökan har behandlats — det är inget fel om du för tillfället bara ser en flik.',
  'onboarding.banner_pending_review_title': 'Din ansökan behandlas',
  'onboarding.banner_pending_review_text':
    'Tack för att du fyllt i dina uppgifter. Noordhoff behandlar nu din information — det tar vanligtvis några arbetsdagar. När ditt konto är aktivt blir alla delar av portalen automatiskt tillgängliga. Du meddelas via e-post.',
  'onboarding.tab_disabled_tooltip': 'Tillgänglig när ditt konto har aktiverats',
  'onboarding.activate_button': 'Aktivera mitt konto',
  'onboarding.activate_button_disabled_hint':
    'Fyll i alla obligatoriska fält innan du skickar din ansökan.',
  'onboarding.activate_confirmation':
    'Din ansökan har skickats. Du får ett e-postmeddelande när ditt konto är aktiverat.',
  'onboarding.save_intermediate': 'Spara framsteg',
  'onboarding.readonly_disclaimer': 'Din ansökan granskas. Ändringar kan inte göras just nu.',
  'onboarding.required_field_hint': 'Obligatoriskt',
  'onboarding.missing_fields_count': '{count} fält återstår',
  'onboarding.progress_step1_label': 'Fyll i profil',
  'onboarding.progress_step2_label': 'Granskning av Noordhoff',
  'onboarding.progress_step3_label': 'Portalen helt aktiv',
  'onboarding.tab_lock_short': 'tillgänglig senare',

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
  'profile.bsn_show': 'Visa BSN',
  'profile.bsn_hide': 'Dölj BSN',
  'profile.bsn_immutable_hint': 'BSN kan inte ändras. För korrigeringar: rights@noordhoff.nl.',

  'greeting.morning': 'God morgon',
  'greeting.afternoon': 'God eftermiddag',
  'greeting.evening': 'God kväll',
  'greeting.night': 'God natt',

  'start.kpi.total_paid': 'Totalt utbetalt',
  'start.kpi.this_year': 'Detta år',
  'start.kpi.statements_count': 'Antal avräkningar',
  'start.kpi.last_payment': 'Senaste avräkning',
  'start.recent_title': 'Senaste avräkningar',
  'start.events_title': 'Kommande evenemang',
  'start.news_title': 'Senaste nytt',
  'start.year_review_badge': 'Årsöversikt',
  'start.total_since': 'Totalt sedan',
  'start.last_payment': 'Senaste betalning',
  'start.expected_next': 'Förväntat',
  'start.tba': 'Meddelas senare',
  'start.royalty_overview': 'Royaltyöversikt',
  'start.amounts_pending': 'Belopp ännu inte angivna',
  'start.academy_label': 'ACADEMY',
  'start.academy_desc':
    'Workshops, didaktik och digitala verktyg för att fördjupa ditt författarskap.',
  'start.paid_in_year': 'Utbetalt {year}',
  'start.expected_in_year': 'Förväntat {year}',
  'start.yoy_vs': 'jämfört med {prevYear}',
  'start.on_date': 'Den {date}',
  'common.not_available_dash': '—',

  'payments.title': 'Royaltyavräkningar',
  'payments.empty': 'Inga avräkningar tillgängliga.',
  'payments.download': 'Ladda ner',
  'payments.missing_pdf': 'PDF saknas',
  'payments.search_placeholder': 'Sök på titel, datum eller belopp…',

  'contracts.title': 'Dina kontrakt',
  'contracts.empty': 'Inga kontrakt registrerade.',
  'contracts.contact_text': 'För frågor om ditt kontrakt, vänligen kontakta rights@noordhoff.nl.',
  'contracts.search_placeholder': 'Sök på namn eller nummer…',
  'contracts.stat_active': 'Aktiva kontrakt',

  'forecast.title': 'Förväntade royalties',
  'forecast.empty': 'Ingen prognos tillgänglig.',
  'forecast.range_label': 'Förväntat belopp',
  'forecast.disclaimer':
    'Indikativ prognos. Det faktiska beloppet kan avvika baserat på slutliga försäljningssiffror och kontraktsändringar.',
  'forecast.pending_headline': 'Inte tillgänglig än',
  'forecast.pending_sub_part1': 'Prognosen publiceras årligen den ',
  'forecast.pending_sub_part2':
    ', efter bearbetning av årsomsättningen. När prognosen för {year} är klar hittar du det förväntade royaltyintervallet här.',
  'forecast.publish_date_label': 'Publiceringsdatum',
  'forecast.auto_notify': 'Du meddelas automatiskt.',
  'forecast.history_title': 'Utbetalning per år',
  'forecast.range_sub': 'Indikativt intervall',
  'forecast.payout_label': 'Utbetalning',
  'forecast.eyebrow_year': 'Förväntade royalties {year}',
  'forecast.payout_month': 'Mars {year}',

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
  'expenses.vendor_id_label': 'Ange ditt Vendor ID på formuläret:',
  'expenses.rules_heading': 'Innan du skickar in: läs riktlinjerna',
  'expenses.dropzone_text': 'Dra en PDF hit eller klicka för att välja',
  'expenses.dropzone_hint': 'Endast PDF, max 10 MB',

  'faq.title': 'Vanliga frågor',
  'faq.intro': 'Svar på de vanligaste frågorna om royalties, kontrakt och portalen.',

  'common.busy': 'Arbetar…',
  'common.close': 'Stäng',

  'profile.changes_heading': 'Begär ändringar',
  'profile.changes_intro':
    'Ändringar granskas av Noordhoff. De träder i kraft först efter godkännande.',
  'profile.changes_empty': 'Inga ändringar gjorda.',
  'profile.changes_saved': 'Ändringar sparade.',
  'profile.changes_nothing': 'Inget att ändra.',
  'profile.pending_change_badge': '⏳ ändring väntar: {value}',
  'profile.changes_submitted': '{count} ändring(ar) skickade. Noordhoff granskar dem.',

  'admin.section_overline': 'Förvaltning',
  'admin.section_heading': 'Författarhantering',
  'admin.empty_filter': 'Inga författare i detta filter.',
  'admin.tab_accounts': 'Konton',
  'admin.tab_persoonsgegevens': 'Personuppgifter',
  'admin.card_add_authors_title': 'Lägg till författare',
  'admin.card_bulk_statements_title': 'Ladda upp royalty-avräkningar',
  'admin.action_help_summary': 'Hur fungerar det?',

  'admin.card_add_authors_help_intro':
    'Författare kommer in i portalen på två sätt. Vilket du väljer beror på om författaren redan är registrerad hos Noordhoff.',
  'admin.card_add_authors_help_existing_label': 'Befintliga författare (via "Importera Excel")',
  'admin.card_add_authors_help_existing_text':
    'Författare som redan är kända hos Noordhoff och finns i NetSuite. Exportera dem som Excel från NetSuite (leverantörslista, 12 kolumner) och ladda upp filen här. Alla konton skapas på en gång MED de befintliga NetSuite-uppgifterna förifyllda. Standardvägen för din initiala population och periodiska uppdateringar.',
  'admin.card_add_authors_help_new_label': 'Nya författare (via "Ny författare")',
  'admin.card_add_authors_help_new_text':
    'Författare som ÄNNU INTE är kända hos Noordhoff — undantag som nya kontrakt som inte ännu behandlats i NetSuite. Ange bara e-post, för- och efternamn. Författaren loggar sedan in själv och fyller i resterande profiluppgifter via portalen. Dessa ändringar visas i fliken "Personuppgifter" under "Väntande ändringsförfrågningar" för ditt godkännande.',
  'admin.card_add_authors_help_outro':
    'I båda fallen får kontot startlösenordet "Noordhoff" som författaren byter vid första inloggning. Först när du klickar "Aktivera" i författarlistan får författaren ett meddelande att de kan logga in. Mejl är av under testfasen — informera testförfattare personligen.',

  'admin.card_bulk_statements_help_intro':
    'En bulk-uppladdning kräver TVÅ filer som laddas upp tillsammans: avräknings-PDF:erna och en Excel med matchande belopp. Nedan hur var och en ska se ut.',
  'admin.card_bulk_statements_help_pdf_heading': 'Fil 1 — Avräknings-PDF:er',
  'admin.card_bulk_statements_help_pdf_para':
    'En PDF per författare per månad. Alliant ID i filnamnet matchas automatiskt mot en författare i portalen — se till att det ID:t är korrekt, annars hamnar avräkningen utan ägare.',
  'admin.card_bulk_statements_help_filename_label': 'Filnamnskonvention:',
  'admin.card_bulk_statements_help_example_label': 'Exempel:',
  'admin.card_bulk_statements_help_excel_heading': 'Fil 2 — Belopps-Excel',
  'admin.card_bulk_statements_help_excel_para':
    'En Excel-fil med beloppen per författare (PDF:n själv innehåller ingen maskinläsbar summa). Första raden måste innehålla exakt dessa tre rubriker i denna ordning:',
  'admin.card_bulk_statements_help_empty_cell': '(tom)',
  'admin.card_bulk_statements_help_col_alliant':
    'Författarens Alliant ID (obligatoriskt). Måste matcha ID:t i PDF-filnamnet.',
  'admin.card_bulk_statements_help_col_amount':
    'Eurobelopp för denna avräkning. Decimalkomma (1.234,56) eller -punkt (1234.56) fungerar båda. Avrundas till 2 decimaler.',
  'admin.card_bulk_statements_help_col_yyyymm':
    'Specifik månad (sex siffror, ÅÅÅÅMM). Lämna tomt = beloppet gäller för ALLA författarens PDF:er i denna batch. För månadsspecifika belopp, fyll i denna kolumn.',
  'admin.card_bulk_statements_help_outro':
    'Välj båda filer tillsammans → klicka "Visa förhandsgranskning" → kontrollera tabellen med författarmatchningar → bekräfta. Dubbeluppladdningar av samma PDF hoppas över automatiskt.',
  'admin.toolbar_excel_import': 'Importera befintliga författare',
  'admin.toolbar_bulk_statements': 'Ladda upp avräkningar',
  'admin.toolbar_csv_export': 'Exportera till NetSuite',
  'admin.toolbar_new_author': 'Importera ny författare',
  'admin.tooltip_excel_import':
    'Skapa flera författare samtidigt från NetSuite-leverantörsexporten. För författare som redan finns hos Noordhoff med ifyllda uppgifter.',
  'admin.tooltip_bulk_statements':
    'Ladda upp flera royalty-avräknings-PDF:er samtidigt. Författare matchas via Alliant ID i filnamnet (NU_SC_<id>_<namn>_<YYYYMM>.pdf).',
  'admin.tooltip_csv_export':
    'Generera en CSV med alla författaruppgifter som ändrats sedan föregående export. För synk tillbaka till NetSuite.',
  'admin.tooltip_new_author':
    'Lägg till en författare manuellt. För undantag som inte kommer via Excel-bulkimporten. Kontot skapas med startlösenordet "Noordhoff" och måste aktiveras senare.',
  'admin.tooltip_send_reminder':
    'Påminn författaren om att fylla i profiluppgifterna. Under testfasen: endast revisionslogg, ingen e-post.',
  'admin.tooltip_activate':
    'Aktivera detta konto. Författaren får e-post om att de kan logga in. Under testfasen: ingen e-post; informera författaren personligen.',
  'admin.tooltip_reset_mfa':
    'Ta bort författarens 2FA-inställningar. Vid nästa inloggning måste hen konfigurera en autentiseringsapp på nytt. Använd om författaren tappat sin enhet.',
  'admin.filter_all': 'Alla',
  'admin.btn_send_reminder_label': 'Skicka påminnelse till författare',
  'admin.btn_activate': 'Aktivera',
  'admin.btn_reset_mfa': 'Återställ 2FA',
  'admin.confirm_reset_mfa':
    'Återställa 2FA för {name}? Vid nästa inloggning måste författaren konfigurera en autentiseringsapp på nytt.',
  'admin.reset_mfa_success': '2FA återställd för {name} ({count} faktor(er) borttagna).',
  'admin.reset_mfa_failed': '2FA-återställning misslyckades',
  'admin.status_admin': 'Admin',
  'admin.status_persoonsgegevens': 'Inaktiv — Personuppgifter saknas',
  'admin.status_persoonsgegevens_short': 'Personuppgifter att lägga till',
  'admin.status_statements': 'Inaktiv — Avräkningar saknas',
  'admin.status_statements_short': 'Avräkningar att lägga till',
  'admin.status_gereed': 'Inaktiv — Redo för aktivering',
  'admin.status_gereed_short': 'Redo för aktivering',
  'admin.status_actief': 'Aktiv',
  'admin.status_actief_short': 'Aktiv',
  'admin.card_export_title': 'Exportera till NetSuite',
  'admin.card_export_help_intro':
    'Författare ändrar sina egna profiluppgifter (adress, IBAN, telefon) via portalen. Dessa ändringar samlas här för periodisk synk tillbaka till NetSuite så att den finansiella administrationen hålls aktuell.',
  'admin.card_export_help_workflow':
    'Klicka "Exportera till NetSuite" → en CSV genereras med all data som ändrats eller aktiverats sedan föregående export → filen laddas ner automatiskt. Ladda upp den till Noordhoff SharePoint inom minuter så NetSuite-teamet kan importera den. Radera lokala kopian efteråt (innehåller personuppgifter).',
  'admin.card_export_help_safety':
    'En tidsstämpel sparas per författare per export så att samma ändring aldrig rapporteras två gånger. Vid en andra klickning får du då "Inga ändringar sedan föregående export".',
  'admin.created_at': 'Skapad {date}',
  'admin.invited_at': 'Inbjuden {date}',
  'admin.reminder_at': 'Påminnelse {date}',
  'admin.activated_at': 'Aktiverad {date}',

  'admin.new_author_heading': 'Ny författare',
  'admin.new_author_intro':
    'Ange e-post + namn. Kontot skapas med startlösenordet "Noordhoff". Lämna det personligen till författaren — vid första inloggning väljer hen ett eget lösenord och därefter 2FA. Inga e-postmeddelanden skickas under testfasen.',
  'admin.new_author_field_email': 'E-post',
  'admin.new_author_field_firstname': 'Förnamn',
  'admin.new_author_field_lastname': 'Efternamn',
  'admin.new_author_field_vendor': 'Vendor ID (valfritt)',
  'admin.new_author_submit': 'Skapa & bjud in',

  'admin.excel_import_heading': 'Importera befintliga författare från NetSuite-Excel',
  'admin.excel_import_intro':
    'Ladda upp NetSuite-leverantörsexporten (12 kolumner, inkl. födelsedatum). För varje rad skapas ett konto med initiallösenordet "Noordhoff". Inga e-postmeddelanden skickas under testfasen.',
  'admin.excel_import_file_label': 'Excel-fil',
  'admin.excel_import_submit': 'Importera',
  'admin.excel_import_close': 'Stäng',
  'admin.excel_import_stat_created': 'Skapade',
  'admin.excel_import_stat_skipped': 'Hoppade över',
  'admin.excel_import_errors_heading': 'Fel ({count})',
  'admin.excel_import_no_file': 'Välj först en Excel-fil.',
  'admin.excel_import_empty': 'Inga rader hittades i Excel-filen.',
  'admin.excel_import_failed': 'Import misslyckades',
  'admin.excel_import_no_response': 'Inget svar mottaget från Edge Function.',
  'admin.excel_import_unexpected': 'Oväntat fel',

  'admin.bulk_stmt_heading': 'Bulkuppladdning av royalty-avräkningar',
  'admin.bulk_stmt_intro':
    'Ladda upp flera NU_SC_*.pdf-filer samtidigt plus en Excel med motsvarande belopp (kolumner: alliant_id, amount, yyyymm). Författare matchas automatiskt via Alliant ID.',
  'admin.bulk_stmt_type_label': 'Avräkningstyp',
  'admin.bulk_stmt_type_royalty': 'Royalty',
  'admin.bulk_stmt_type_subsidiary': 'Bilaterala rättigheter',
  'admin.bulk_stmt_type_foreign': 'Utländska rättigheter',
  'admin.bulk_stmt_type_jaaropgave': 'Årsbesked',
  'admin.bulk_stmt_pdf_label': 'Avräknings-PDF-filer (flera valbara)',
  'admin.bulk_stmt_amounts_label': 'Belopps-Excel (alliant_id, amount, yyyymm)',
  'admin.bulk_stmt_preview_btn': 'Visa förhandsgranskning',
  'admin.bulk_stmt_no_pdfs': 'Välj minst en PDF.',
  'admin.bulk_stmt_no_amounts': 'Välj en belopps-Excel.',
  'admin.bulk_stmt_pdf_too_large': 'Filen "{file}" är större än {max} MB.',
  'admin.bulk_stmt_batch_too_large':
    'Total batchstorlek är {mb} MB — det kan göra webbläsaren långsam. Dela upp om möjligt.',
  'admin.bulk_stmt_unexpected': 'Oväntat fel',
  'admin.bulk_stmt_group_ready': 'Klar att ladda upp',
  'admin.bulk_stmt_group_duplicate': 'Redan uppladdad',
  'admin.bulk_stmt_group_error': 'Problem',
  'admin.bulk_stmt_status_ready': 'Klar att ladda upp',
  'admin.bulk_stmt_status_no_author':
    'Ingen författare hittades för Alliant ID {id}. Skapa författaren först via "Importera Excel".',
  'admin.bulk_stmt_status_duplicate':
    'Avräkning finns redan för denna författare + period — hoppas över.',
  'admin.bulk_stmt_status_no_amount':
    'Belopp saknas för Alliant ID {id}. Lägg till en rad i belopps-Excel.',
  'admin.bulk_stmt_upload_btn': 'Ladda upp {count} avräkningar',
  'admin.bulk_stmt_uploading': 'Laddar upp…',
  'admin.bulk_stmt_result_succeeded': 'Lyckades',
  'admin.bulk_stmt_result_skipped': 'Hoppades över',
  'admin.bulk_stmt_result_failed': 'Misslyckades',
  'admin.bulk_stmt_result_errors_heading': 'Detaljer ({count})',

  'admin.csv_export_heading': 'Exportera till NetSuite',
  'admin.csv_export_intro':
    'Genererar en CSV med alla författaruppgifter som ändrats eller nyligen aktiverats sedan föregående export. Filen laddas ner — ladda upp till Noordhoff SharePoint inom minuter och radera lokalt.',
  'admin.csv_export_reason_label': 'Anledning / kommentar (valfritt — sparas i revisionsloggen)',
  'admin.csv_export_reason_placeholder': 't.ex. Veckovis NetSuite-synk',
  'admin.csv_export_submit_count': 'Exportera & ladda ner ({count} rader)',
  'admin.csv_export_submit': 'Exportera & ladda ner',
  'admin.csv_export_no_changes': 'Inga ändringar sedan föregående export.',
  'admin.csv_export_summary_count': '{count} författare ingår:',
  'admin.csv_export_row_more': '… och {count} till',
  'admin.csv_export_success_heading': 'Export klar',
  'admin.csv_export_success_text':
    'Ladda upp denna CSV till Noordhoff SharePoint och radera lokalt. Revisionslogg:',
  'admin.csv_export_row_new': 'ny',
  'admin.csv_export_row_changed': 'ändrad',

  'admin.statement_upload_heading': 'Ladda upp ny avräkning',
  'admin.statement_upload_field_type': 'Typ',
  'admin.statement_upload_field_file': 'PDF-fil',
  'admin.statement_upload_submit': 'Ladda upp',
  'admin.statement_upload_busy': 'Laddar upp…',

  'admin.changes_heading': 'Väntande ändringsförfrågningar',
  'admin.changes_empty': 'Inga väntande förfrågningar.',
  'admin.changes_approve': 'Godkänn',
  'admin.changes_reject': 'Avvisa',
};
