import type { Translations } from './types';

export const nl: Translations = {
  'app.title': 'Auteursportaal',
  'app.tagline': 'Krijg direct inzicht in uw royalties, afrekeningen en prognoses.',
  'common.loading': 'Laden…',
  'common.save': 'Opslaan',
  'common.cancel': 'Annuleren',
  'common.edit': 'Bewerken',
  'common.delete': 'Verwijderen',
  'common.search': 'Zoeken',
  'common.missing': 'ontbreekt',

  'auth.login.title': 'Welkom bij Noordhoff',
  'auth.login.subtitle': 'Log in om uw royalty-informatie te bekijken',
  'auth.login.email_label': 'E-mailadres',
  'auth.login.password_label': 'Wachtwoord',
  'auth.login.submit': 'Inloggen',
  'auth.login.forgot_password': 'Wachtwoord vergeten?',
  'auth.login.forgot_submit': 'Wachtwoord resetten',
  'auth.login.forgot_back': '← terug naar inloggen',
  'auth.login.forgot_sent':
    'Als dit e-mailadres bij ons bekend is, ontvangt u binnen enkele minuten een link om een nieuw wachtwoord in te stellen.',
  'auth.login.error_invalid': 'Ongeldig e-mailadres of wachtwoord.',
  'auth.login.error_generic': 'Er is een fout opgetreden. Probeer het opnieuw.',
  'auth.login.brand_title': 'Auteursportaal',
  'auth.login.brand_subtitle':
    'Inzicht in uw royalties, contracten en afrekeningen, altijd en overal.',
  'auth.login.stat_years': 'jaar ervaring',
  'auth.login.stat_authors': 'actieve auteurs',
  'auth.login.stat_publications': 'publicaties',
  'auth.set_password.title': 'Stel uw wachtwoord in',
  'auth.set_password.submit': 'Wachtwoord opslaan',
  'auth.logout': 'Uitloggen',

  'auth.force_password.title': 'Kies een eigen wachtwoord',
  'auth.force_password.intro':
    'Welkom! U bent ingelogd met het door Noordhoff verstrekte start-wachtwoord. Kies nu een eigen wachtwoord om verder te gaan.',
  'auth.force_password.field_new': 'Nieuw wachtwoord',
  'auth.force_password.field_confirm': 'Bevestig wachtwoord',
  'auth.force_password.hint':
    'Minimaal {min} tekens. Gebruik een combinatie van letters, cijfers en leestekens.',
  'auth.force_password.submit': 'Wachtwoord opslaan',
  'auth.force_password.error_too_short': 'Wachtwoord moet minimaal {min} tekens zijn.',
  'auth.force_password.error_mismatch': 'De wachtwoorden komen niet overeen.',
  'auth.force_password.error_same_as_initial':
    'Kies een wachtwoord dat niet gelijk is aan het start-wachtwoord.',
  'auth.force_password.error_generic': 'Wachtwoord opslaan faalde. Probeer opnieuw.',
  'auth.force_password.error_flag_failed':
    'Wachtwoord is opgeslagen, maar de status kon niet worden bijgewerkt. Laad de pagina opnieuw.',

  'auth.mfa_enroll.title': 'Stel 2-staps verificatie in',
  'auth.mfa_enroll.intro':
    'Beveilig uw account met een tweede stap. Installeer een authenticator-app (bv. Google Authenticator, Microsoft Authenticator, Authy of 1Password), scan de QR-code en voer vervolgens de 6-cijferige code in.',
  'auth.mfa_enroll.step_scan': '1. Scan de QR-code met uw authenticator-app',
  'auth.mfa_enroll.qr_alt': 'QR-code voor authenticator-app',
  'auth.mfa_enroll.manual_label': 'Lukt scannen niet? Voer deze code handmatig in:',
  'auth.mfa_enroll.step_verify': '2. Voer de 6-cijferige code in die uw app toont',
  'auth.mfa_enroll.code_label': 'Verificatiecode (6 cijfers)',
  'auth.mfa_enroll.submit': 'Bevestig & activeer',
  'auth.mfa_enroll.error_enroll': '2FA opzetten faalde. Probeer opnieuw of log uit en weer in.',
  'auth.mfa_enroll.error_challenge': 'Verificatie kon niet worden gestart. Probeer opnieuw.',
  'auth.mfa_enroll.error_code_format': 'Voer 6 cijfers in.',
  'auth.mfa_enroll.error_invalid_code':
    'Onjuiste code. Controleer in uw authenticator-app en probeer opnieuw.',

  'auth.mfa_challenge.title': '2-staps verificatie',
  'auth.mfa_challenge.intro': 'Voer de 6-cijferige code uit uw authenticator-app in.',
  'auth.mfa_challenge.code_label': 'Verificatiecode',
  'auth.mfa_challenge.submit': 'Inloggen',
  'auth.mfa_challenge.error_code_format': 'Voer 6 cijfers in.',
  'auth.mfa_challenge.error_invalid_code': 'Onjuiste code. Probeer opnieuw.',
  'auth.mfa_challenge.error_generic': 'Verificatie faalde. Probeer opnieuw.',
  'auth.no_access.title': 'Geen toegang',
  'auth.no_access.message':
    'Dit account heeft geen toegang tot het auteursportaal. Neem contact op met Noordhoff.',

  'header.search_placeholder': 'Zoek tabs, afrekeningen, contracten, FAQ…',
  'header.search_label': 'Zoeken…',
  'header.app_label': 'Auteursportaal',

  'cmd.placeholder': 'Zoek tabs, afrekeningen, contracten, FAQ…',
  'cmd.no_results': 'Geen resultaten',
  'cmd.group_navigation': 'Navigatie',
  'cmd.group_payments': 'Afrekeningen',
  'cmd.group_contracts': 'Contracten',
  'cmd.group_faq': 'FAQ',
  'cmd.hint_open_tab': 'Open tabblad',

  'pdf.download': 'Download',
  'pdf.loading': 'PDF laden…',

  'tabs.start': 'Start',
  'tabs.payments': 'Afrekeningen',
  'tabs.contracts': 'Contracten',
  'tabs.forecast': 'Prognose',
  'tabs.expenses': 'Declaraties',
  'tabs.faq': 'FAQ',
  'tabs.profile': 'Profiel',

  'onboarding.banner_blocking_title': 'Vul uw gegevens aan om uw account te activeren',
  'onboarding.banner_blocking_text':
    'Er ontbreken nog gegevens die nodig zijn voor activatie: adres, IBAN, BIC en/of BSN. Zonder deze informatie kan Noordhoff uw account niet activeren. Vul de ontbrekende velden hieronder aan op uw profielpagina.',
  'onboarding.banner_softmissing_title':
    'Uw gegevens zijn compleet — Noordhoff activeert uw account binnenkort',
  'onboarding.banner_softmissing_text':
    'Bedankt voor het invullen. Uw account wordt zo snel mogelijk geactiveerd. Telefoonnummer en geboortedatum mag u nu nog rustig aanvullen via uw profielpagina hieronder.',
  'onboarding.banner_pending_review_title': 'Uw aanvraag wordt verwerkt',
  'onboarding.banner_pending_review_text':
    'Bedankt voor het invullen. Noordhoff verwerkt nu uw gegevens — dit duurt doorgaans enkele werkdagen. Zodra uw account actief is komen alle onderdelen van het portaal automatisch beschikbaar. U krijgt hierover bericht per e-mail.',
  'onboarding.tab_disabled_tooltip': 'Beschikbaar zodra uw account is geactiveerd',
  'onboarding.activate_button': 'Verzend gegevens',
  'onboarding.activate_button_disabled_hint':
    'Vul eerst alle verplichte velden in om uw aanvraag te kunnen versturen.',
  'onboarding.activate_confirmation':
    'Uw aanvraag is verstuurd. U ontvangt een e-mail zodra uw account is geactiveerd.',
  'onboarding.save_intermediate': 'Tussentijds opslaan',
  'onboarding.readonly_disclaimer':
    'Uw aanvraag wordt beoordeeld. Wijzigingen zijn op dit moment niet mogelijk.',
  'onboarding.required_field_hint': 'Verplicht',
  'onboarding.missing_fields_count': 'Nog {count} veld(en) in te vullen',
  'onboarding.progress_step1_label': 'Profiel invullen',
  'onboarding.progress_step2_label': 'Beoordeling Noordhoff',
  'onboarding.progress_step3_label': 'Portaal volledig actief',
  'onboarding.tab_lock_short': 'later beschikbaar',

  'profile.title': 'Uw gegevens',
  'profile.id_vendor': 'Vendor ID',
  'profile.id_alliant': 'Alliant ID',
  'profile.label_firstname': 'Voornaam',
  'profile.label_lastname': 'Achternaam',
  'profile.label_email': 'E-mailadres',
  'profile.label_phone': 'Telefoonnummer',
  'profile.label_address': 'Adres',
  'profile.label_postcode': 'Postcode',
  'profile.label_city': 'Plaats',
  'profile.label_country': 'Land',
  'profile.label_birthdate': 'Geboortedatum',
  'profile.label_bsn': 'BSN',
  'profile.label_iban': 'IBAN',
  'profile.label_bic': 'BIC',
  'profile.bsn_show': 'Toon BSN',
  'profile.bsn_hide': 'Verberg BSN',
  'profile.bsn_immutable_hint':
    'BSN kan niet worden gewijzigd. Voor correctie: rights@noordhoff.nl.',

  'greeting.morning': 'Goedemorgen',
  'greeting.afternoon': 'Goedemiddag',
  'greeting.evening': 'Goedenavond',
  'greeting.night': 'Goedenacht',

  'start.kpi.total_paid': 'Totaal uitgekeerd',
  'start.kpi.this_year': 'Dit jaar',
  'start.kpi.statements_count': 'Aantal afrekeningen',
  'start.kpi.last_payment': 'Laatste afrekening',
  'start.recent_title': 'Recente afrekeningen',
  'start.events_title': 'Aankomende evenementen',
  'start.news_title': 'Laatste nieuws',
  'start.year_review_badge': 'Jaaroverzicht',
  'start.total_since': 'Totaal vanaf',
  'start.last_payment': 'Laatste betaling',
  'start.expected_next': 'Verwacht',
  'start.tba': 'Wordt bekendgemaakt',
  'start.royalty_overview': 'Royalty-overzicht',
  'start.amounts_pending': 'Bedragen nog niet ingevoerd',
  'start.academy_label': 'ACADEMY',
  'start.academy_desc': 'Workshops, didactiek en digitale tools om je auteurschap te verdiepen.',
  'start.paid_in_year': 'Uitgekeerd in {year}',
  'start.expected_in_year': 'Verwacht in {year}',
  'start.yoy_vs': 't.o.v. {prevYear}',
  'start.on_date': 'Op {date}',
  'common.not_available_dash': '—',

  'payments.title': 'Royalty-afrekeningen',
  'payments.empty': 'Geen afrekeningen beschikbaar.',
  'payments.download': 'Download',
  'payments.missing_pdf': 'PDF ontbreekt',
  'payments.search_placeholder': 'Zoek op titel, datum of bedrag…',

  'contracts.title': 'Uw contracten',
  'contracts.empty': 'Geen contracten geregistreerd.',
  'contracts.contact_text':
    'Voor vragen over uw contract kunt u contact opnemen met rights@noordhoff.nl.',
  'contracts.search_placeholder': 'Zoek op naam of nummer…',
  'contracts.stat_active': 'Actieve contracten',

  'forecast.title': 'Verwachte royalties',
  'forecast.empty': 'Geen prognose beschikbaar.',
  'forecast.range_label': 'Verwacht bedrag',
  'forecast.disclaimer':
    'Indicatieve prognose. Het werkelijke bedrag kan afwijken op basis van definitieve verkoopcijfers en contractwijzigingen.',
  'forecast.pending_headline': 'Nog niet beschikbaar',
  'forecast.pending_sub_part1': 'De prognose wordt jaarlijks gepubliceerd op ',
  'forecast.pending_sub_part2':
    ', na verwerking van de jaaromzet. Zodra de prognose voor {year} klaar staat, vindt u hier de verwachte royalty-range.',
  'forecast.publish_date_label': 'Publicatiedatum',
  'forecast.auto_notify': 'U ontvangt automatisch bericht.',
  'forecast.history_title': 'Uitbetaling per jaar',
  'forecast.range_sub': 'Indicatieve bandbreedte',
  'forecast.payout_label': 'Uitbetaling',
  'forecast.eyebrow_year': 'Verwachte royalties {year}',
  'forecast.payout_month': 'Maart {year}',

  'expenses.title': 'Declaraties',
  'expenses.new_title': 'Nieuwe declaratie indienen',
  'expenses.field_description': 'Omschrijving',
  'expenses.field_amount': 'Bedrag (€)',
  'expenses.field_type': 'Type',
  'expenses.field_receipt': 'Bon (PDF)',
  'expenses.submit': 'Indienen',
  'expenses.history_title': 'Ingediende declaraties',
  'expenses.history_empty': 'U heeft nog geen declaraties ingediend.',
  'expenses.status_pending': 'In behandeling',
  'expenses.status_approved': 'Goedgekeurd',
  'expenses.status_rejected': 'Afgewezen',
  'expenses.status_paid': 'Uitbetaald',
  'expenses.vendor_id_label': 'Vermeld uw Vendor ID op het formulier:',
  'expenses.rules_heading': 'Voor u declareert: lees de spelregels',
  'expenses.dropzone_text': 'Sleep een PDF hierheen of klik om te selecteren',
  'expenses.dropzone_hint': 'Alleen PDF, max 10 MB',

  'faq.title': 'Veelgestelde vragen',
  'faq.intro': 'Antwoorden op de meest gestelde vragen over royalties, contracten en het portaal.',

  'common.busy': 'Bezig…',
  'common.close': 'Sluiten',

  'profile.changes_heading': 'Wijzigingen aanvragen',
  'profile.changes_intro':
    'Wijzigingen worden eerst door de uitgever beoordeeld. Pas na goedkeuring zijn ze definitief.',
  'profile.changes_empty': 'Geen wijzigingen aangebracht.',
  'profile.changes_saved': 'Wijzigingen opgeslagen.',
  'profile.changes_nothing': 'Niets te wijzigen.',
  'profile.pending_change_badge': '⏳ wijziging in behandeling: {value}',
  'profile.changes_submitted': '{count} wijziging(en) ingediend. De uitgever beoordeelt deze.',

  'admin.section_overline': 'Beheer',
  'admin.section_heading': 'Auteursbeheer',
  'admin.empty_filter': 'Geen auteurs in dit filter.',
  'admin.tab_accounts': 'Accounts',
  'admin.tab_persoonsgegevens': 'Persoonsgegevens',
  'admin.card_add_authors_title': 'Auteurs toevoegen',
  'admin.card_bulk_statements_title': 'Royaltystatements uploaden',
  'admin.action_help_summary': 'Hoe werkt dit?',

  'admin.card_add_authors_help_intro':
    'Auteurs komen op twee manieren in het portaal. Welke je kiest hangt af van of de auteur al bij Noordhoff geregistreerd staat.',
  'admin.card_add_authors_help_existing_label': 'Bestaande auteurs (via "Importeer Excel")',
  'admin.card_add_authors_help_existing_text':
    'Auteurs die al bij Noordhoff bekend zijn en in NetSuite staan. Exporteer ze als Excel uit NetSuite (Vendor-list export, 12 kolommen) en upload het bestand hier. In één keer worden alle accounts aangemaakt mét de bestaande NetSuite-gegevens — naam, adres, IBAN, BIC, BSN en geboortedatum — al ingevuld. Dit is de standaard-route voor je beginpopulatie en voor periodieke updates wanneer NetSuite nieuwe auteurs toevoegt.',
  'admin.card_add_authors_help_new_label': 'Nieuwe auteurs (via "Nieuwe auteur")',
  'admin.card_add_authors_help_new_text':
    'Auteurs die nog NIET bij Noordhoff bekend zijn — uitzonderingen zoals nieuwe contracten die nog niet in NetSuite verwerkt zijn. Vul alleen e-mail, voor- en achternaam in. De auteur logt vervolgens zelf in en vult de overige profielgegevens (adres, IBAN, BSN, geboortedatum) aan via het portaal. Die wijzigingen verschijnen in het tabblad "Persoonsgegevens" onder "Wachtende wijzigingsverzoeken" voor jouw goedkeuring.',
  'admin.card_add_authors_help_outro':
    'In beide gevallen krijgt het account start-wachtwoord "Noordhoff" dat de auteur bij eerste inlog wijzigt. Pas nadat jij in de auteurslijst op "Activeer" klikt krijgt de auteur een melding dat hij/zij kan inloggen. Tijdens de test-fase staan mails uit — informeer test-auteurs persoonlijk.',

  'admin.card_bulk_statements_help_intro':
    'Voor een bulk-upload heb je TWEE bestanden nodig die samen geupload moeten worden: de statement-PDFs en een Excel met de bijhorende bedragen. Hieronder hoe elk eruit hoort te zien.',
  'admin.card_bulk_statements_help_pdf_heading': 'Bestand 1 — Statement-PDFs',
  'admin.card_bulk_statements_help_pdf_para':
    'Eén PDF per auteur per maand. De Alliant ID in de filename wordt automatisch gematcht aan een auteur in het portaal — zorg dus dat die ID klopt, anders krijgt de statement geen eigenaar.',
  'admin.card_bulk_statements_help_filename_label': 'Filename-conventie:',
  'admin.card_bulk_statements_help_example_label': 'Voorbeeld:',
  'admin.card_bulk_statements_help_excel_heading': 'Bestand 2 — Bedragen-Excel',
  'admin.card_bulk_statements_help_excel_para':
    'Eén Excel-bestand met de bedragen per auteur (de PDF zelf bevat geen machine-leesbare som). De eerste rij moet exact deze drie headers bevatten in deze volgorde:',
  'admin.card_bulk_statements_help_empty_cell': '(leeg)',
  'admin.card_bulk_statements_help_col_alliant':
    'Alliant ID van de auteur (verplicht). Komt overeen met de ID in de PDF-filename.',
  'admin.card_bulk_statements_help_col_amount':
    'Euro-bedrag voor deze statement. Decimaal-komma (1.234,56) of -punt (1234.56) is allebei OK. Wordt afgerond op 2 decimalen.',
  'admin.card_bulk_statements_help_col_yyyymm':
    'Specifieke maand (zes cijfers, JJJJMM). Leeg laten = bedrag geldt voor álle PDFs van die auteur in deze batch — handig als je per upload één auteur één bedrag wilt geven. Voor maand-specifieke bedragen vul je deze kolom wel in.',
  'admin.card_bulk_statements_help_outro':
    'Selecteer beide bestanden samen → klik "Voorbeeld tonen" → controleer de tabel met auteur-matches → bevestig. Dubbel-uploaden van dezelfde PDF wordt automatisch overgeslagen.',
  'admin.toolbar_excel_import': 'Importeer bestaande auteurs',
  'admin.toolbar_bulk_statements': 'Upload Statements',
  'admin.toolbar_csv_export': 'Export naar NetSuite',
  'admin.toolbar_new_author': 'Importeer nieuwe auteur',
  'admin.tooltip_excel_import':
    'Maak in één keer meerdere auteurs aan vanuit de NetSuite-Vendor-export. Voor auteurs die al bij Noordhoff bekend zijn en hun gegevens al ingevuld hebben.',
  'admin.tooltip_bulk_statements':
    'Upload meerdere royalty-statement-PDFs tegelijk. Auteurs worden automatisch gematcht via Alliant ID in de filename (NU_SC_<id>_<naam>_<YYYYMM>.pdf).',
  'admin.tooltip_csv_export':
    'Genereer een CSV met alle auteursgegevens die gewijzigd zijn sinds de vorige export. Voor sync terug naar NetSuite.',
  'admin.tooltip_new_author':
    'Voeg één auteur handmatig toe. Voor uitzonderingen die niet via de bulk-Excel-import komen. Account krijgt start-wachtwoord "Noordhoff" en moet later geactiveerd worden.',
  'admin.tooltip_send_reminder':
    'Herinner de auteur eraan zijn/haar profielgegevens aan te vullen. Tijdens de test-fase: alleen audit-log, geen mail.',
  'admin.tooltip_activate':
    'Activeer dit account. De auteur krijgt een mail dat hij/zij kan inloggen. Tijdens test-fase: geen mail; informeer de auteur persoonlijk.',
  'admin.tooltip_reset_mfa':
    "Verwijder de 2FA-instellingen van deze auteur. Bij volgende inlog moet hij/zij een nieuwe authenticator-app instellen. Gebruik dit als de auteur z'n device kwijt is.",
  'admin.filter_all': 'Alle',
  'admin.btn_send_reminder_label': 'Stuur reminder naar auteur',
  'admin.btn_activate': 'Activeer',
  'admin.btn_reset_mfa': 'Reset 2FA',
  'admin.confirm_reset_mfa':
    '2FA resetten voor {name}? Bij volgende inlog moet de auteur opnieuw een authenticator-app instellen.',
  'admin.reset_mfa_success': '2FA gereset voor {name} ({count} factor(en) verwijderd).',
  'admin.reset_mfa_failed': '2FA resetten faalde',
  'admin.status_admin': 'Admin',
  'admin.status_persoonsgegevens': 'Inactief — Persoonsgegevens nog toe te voegen',
  'admin.status_persoonsgegevens_short': 'Persoonsgegevens toe te voegen',
  'admin.status_statements': 'Inactief — Statements nog toe te voegen',
  'admin.status_statements_short': 'Statements toe te voegen',
  'admin.status_gereed': 'Inactief — Gereed voor activatie',
  'admin.status_gereed_short': 'Gereed voor activatie',
  'admin.status_actief': 'Actief',
  'admin.status_actief_short': 'Actief',
  'admin.card_export_title': 'Export naar NetSuite',
  'admin.card_export_help_intro':
    'Auteurs wijzigen hun eigen profielgegevens (adres, IBAN, telefoon) via het portaal. Die wijzigingen worden hier verzameld om periodiek terug te synchroniseren naar NetSuite, zodat de financiële administratie up-to-date blijft.',
  'admin.card_export_help_workflow':
    'Klik op "Export naar NetSuite" → er wordt een CSV gegenereerd met alle gegevens die zijn gewijzigd of geactiveerd sinds de vorige export → het bestand wordt automatisch gedownload. Upload het binnen enkele minuten naar Noordhoff SharePoint zodat de NetSuite-administratie het kan importeren. Verwijder de lokale kopie daarna (bevat persoonsgegevens).',
  'admin.card_export_help_safety':
    'Per export wordt een tijdstempel per auteur bijgehouden, zodat dezelfde wijziging niet twee keer gerapporteerd wordt. Bij een tweede klik krijg je dan ook "Geen wijzigingen sinds vorige export".',
  'admin.created_at': 'Aangemaakt {date}',
  'admin.invited_at': 'Uitgenodigd {date}',
  'admin.reminder_at': 'Reminder {date}',
  'admin.activated_at': 'Geactiveerd {date}',

  'admin.new_author_heading': 'Nieuwe auteur',
  'admin.new_author_intro':
    'Vul email + naam in. Het account wordt aangemaakt met het start-wachtwoord "Noordhoff". Geef dat persoonlijk aan de auteur door — bij eerste inlog kiest hij/zij zelf een eigen wachtwoord en daarna 2FA. Tijdens de test-fase versturen we geen mails.',
  'admin.new_author_field_email': 'E-mail',
  'admin.new_author_field_firstname': 'Voornaam',
  'admin.new_author_field_lastname': 'Achternaam',
  'admin.new_author_field_vendor': 'Vendor ID (optioneel)',
  'admin.new_author_submit': 'Aanmaken & uitnodigen',

  'admin.excel_import_heading': 'Bestaande auteurs uit NetSuite-Excel importeren',
  'admin.excel_import_intro':
    'Upload de NetSuite-Vendor-export (12 kolommen, incl. Date of Birth). Voor elke rij wordt een account aangemaakt met initieel wachtwoord "Noordhoff". Er worden tijdens de test-fase geen mails verstuurd.',
  'admin.excel_import_file_label': 'Excel-bestand',
  'admin.excel_import_submit': 'Importeer',
  'admin.excel_import_close': 'Sluiten',
  'admin.excel_import_stat_created': 'Aangemaakt',
  'admin.excel_import_stat_skipped': 'Overgeslagen',
  'admin.excel_import_errors_heading': 'Fouten ({count})',
  'admin.excel_import_no_file': 'Selecteer eerst een Excel-bestand.',
  'admin.excel_import_empty': 'Geen rijen gevonden in het Excel-bestand.',
  'admin.excel_import_failed': 'Importeren faalde',
  'admin.excel_import_no_response': 'Geen resultaat ontvangen van Edge Function.',
  'admin.excel_import_unexpected': 'Onverwachte fout',

  'admin.bulk_stmt_heading': 'Royalty-statements bulk uploaden',
  'admin.bulk_stmt_intro':
    'Upload meerdere NU_SC_*.pdf bestanden tegelijk plus een Excel met de bijbehorende bedragen (kolommen: alliant_id, amount, yyyymm). Auteurs worden automatisch gematcht via hun Alliant ID.',
  'admin.bulk_stmt_type_label': 'Type afrekening',
  'admin.bulk_stmt_type_royalty': 'Royalty',
  'admin.bulk_stmt_type_subsidiary': 'Nevenrechten',
  'admin.bulk_stmt_type_foreign': 'Buitenlandse rechten',
  'admin.bulk_stmt_type_jaaropgave': 'Jaaropgave',
  'admin.bulk_stmt_pdf_label': 'Statement-PDFs (meerdere selecteerbaar)',
  'admin.bulk_stmt_amounts_label': 'Excel met bedragen (alliant_id, amount, yyyymm)',
  'admin.bulk_stmt_preview_btn': 'Voorbeeld tonen',
  'admin.bulk_stmt_no_pdfs': 'Selecteer minstens één PDF.',
  'admin.bulk_stmt_no_amounts': 'Selecteer een bedragen-Excel.',
  'admin.bulk_stmt_pdf_too_large': 'Bestand "{file}" is groter dan {max} MB.',
  'admin.bulk_stmt_batch_too_large':
    'Totaal van geselecteerde bestanden is {mb} MB — dat kan traag laden in de browser. Knip de batch eventueel op.',
  'admin.bulk_stmt_unexpected': 'Onverwachte fout',
  'admin.bulk_stmt_group_ready': 'Klaar voor upload',
  'admin.bulk_stmt_group_duplicate': 'Al aanwezig',
  'admin.bulk_stmt_group_error': 'Probleem',
  'admin.bulk_stmt_status_ready': 'Klaar voor upload',
  'admin.bulk_stmt_status_no_author':
    'Geen auteur gevonden voor Alliant ID {id}. Maak de auteur eerst aan via "Importeer Excel".',
  'admin.bulk_stmt_status_duplicate':
    'Statement al aanwezig voor deze auteur + periode — wordt overgeslagen.',
  'admin.bulk_stmt_status_no_amount':
    'Bedrag ontbreekt voor Alliant ID {id}. Voeg een rij toe in de bedragen-Excel.',
  'admin.bulk_stmt_upload_btn': 'Upload {count} statements',
  'admin.bulk_stmt_uploading': 'Uploaden…',
  'admin.bulk_stmt_result_succeeded': 'Succesvol',
  'admin.bulk_stmt_result_skipped': 'Overgeslagen',
  'admin.bulk_stmt_result_failed': 'Mislukt',
  'admin.bulk_stmt_result_errors_heading': 'Details ({count})',

  'admin.csv_export_heading': 'Export naar NetSuite',
  'admin.csv_export_intro':
    'Genereert een CSV met alle auteursgegevens die zijn gewijzigd of nieuw geactiveerd sinds vorige export. Bestand wordt gedownload — upload binnen enkele minuten naar Noordhoff SharePoint en verwijder lokaal.',
  'admin.csv_export_reason_label': 'Reden / opmerking (optioneel — komt in audit-log)',
  'admin.csv_export_reason_placeholder': 'bv. Wekelijkse NetSuite-sync',
  'admin.csv_export_submit_count': 'Exporteer & download ({count} rijen)',
  'admin.csv_export_submit': 'Exporteer & download',
  'admin.csv_export_no_changes': 'Geen wijzigingen sinds vorige export.',
  'admin.csv_export_summary_count': '{count} auteur(s) komen in deze export:',
  'admin.csv_export_row_more': '… en {count} meer',
  'admin.csv_export_success_heading': 'Export voltooid',
  'admin.csv_export_success_text':
    'Upload deze CSV nu naar Noordhoff SharePoint en verwijder lokaal. Audit-log:',
  'admin.csv_export_row_new': 'nieuw',
  'admin.csv_export_row_changed': 'gewijzigd',

  'admin.statement_upload_heading': 'Nieuw statement uploaden',
  'admin.statement_upload_field_type': 'Type',
  'admin.statement_upload_field_file': 'PDF-bestand',
  'admin.statement_upload_submit': 'Uploaden',
  'admin.statement_upload_busy': 'Bezig met uploaden…',

  'admin.changes_heading': 'Wachtende wijzigingsverzoeken',
  'admin.changes_empty': 'Geen wachtende verzoeken.',
  'admin.changes_approve': 'Goedkeuren',
  'admin.changes_reject': 'Afwijzen',
};
