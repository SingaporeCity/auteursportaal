import type { Translations } from './types';

export const en: Translations = {
  'app.title': 'Author Portal',
  'app.tagline': 'Direct insight into your royalties, statements and forecasts.',
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.search': 'Search',
  'common.missing': 'missing',

  'auth.login.title': 'Welcome to Noordhoff',
  'auth.login.subtitle': 'Sign in to view your royalty information',
  'auth.login.email_label': 'Email address',
  'auth.login.password_label': 'Password',
  'auth.login.submit': 'Sign in',
  'auth.login.forgot_password': 'Forgot password?',
  'auth.login.forgot_submit': 'Reset password',
  'auth.login.forgot_back': '← back to sign in',
  'auth.login.forgot_sent':
    'If this email address is known to us, you will receive a link to set a new password within a few minutes.',
  'auth.login.error_invalid': 'Invalid email address or password.',
  'auth.login.error_generic': 'Something went wrong. Please try again.',
  'auth.login.brand_title': 'Author Portal',
  'auth.login.brand_subtitle':
    'Insight into your royalties, contracts and statements, anytime and anywhere.',
  'auth.login.stat_years': 'years of experience',
  'auth.login.stat_authors': 'active authors',
  'auth.login.stat_publications': 'publications',
  'auth.set_password.title': 'Set your password',
  'auth.set_password.submit': 'Save password',
  'auth.logout': 'Sign out',

  'auth.force_password.title': 'Choose your own password',
  'auth.force_password.intro':
    'Welcome! You are signed in with the initial password provided by Noordhoff. Please choose your own password to continue.',
  'auth.force_password.field_new': 'New password',
  'auth.force_password.field_confirm': 'Confirm password',
  'auth.force_password.hint': 'At least {min} characters. Mix letters, numbers, and punctuation.',
  'auth.force_password.submit': 'Save password',
  'auth.force_password.error_too_short': 'Password must be at least {min} characters.',
  'auth.force_password.error_mismatch': 'The passwords do not match.',
  'auth.force_password.error_same_as_initial':
    'Please choose a password different from the initial one.',
  'auth.force_password.error_generic': 'Saving the password failed. Please try again.',
  'auth.force_password.error_flag_failed':
    'Password saved but status could not be updated. Please reload the page.',

  'auth.mfa_enroll.title': 'Set up two-factor authentication',
  'auth.mfa_enroll.intro':
    'Secure your account with a second step. Install an authenticator app (e.g. Google Authenticator, Microsoft Authenticator, Authy or 1Password), scan the QR code, and enter the 6-digit code.',
  'auth.mfa_enroll.step_scan': '1. Scan the QR code with your authenticator app',
  'auth.mfa_enroll.qr_alt': 'QR code for authenticator app',
  'auth.mfa_enroll.manual_label': "Can't scan? Enter this code manually:",
  'auth.mfa_enroll.step_verify': '2. Enter the 6-digit code shown by your app',
  'auth.mfa_enroll.code_label': 'Verification code (6 digits)',
  'auth.mfa_enroll.submit': 'Confirm & activate',
  'auth.mfa_enroll.error_enroll': '2FA setup failed. Please try again or sign out and back in.',
  'auth.mfa_enroll.error_challenge': 'Could not start verification. Please try again.',
  'auth.mfa_enroll.error_code_format': 'Please enter 6 digits.',
  'auth.mfa_enroll.error_invalid_code':
    'Incorrect code. Check your authenticator app and try again.',

  'auth.mfa_challenge.title': 'Two-factor verification',
  'auth.mfa_challenge.intro': 'Enter the 6-digit code from your authenticator app.',
  'auth.mfa_challenge.code_label': 'Verification code',
  'auth.mfa_challenge.submit': 'Sign in',
  'auth.mfa_challenge.error_code_format': 'Please enter 6 digits.',
  'auth.mfa_challenge.error_invalid_code': 'Incorrect code. Please try again.',
  'auth.mfa_challenge.error_generic': 'Verification failed. Please try again.',
  'auth.no_access.title': 'No access',
  'auth.no_access.message':
    'This account does not have access to the author portal. Please contact Noordhoff.',

  'header.search_placeholder': 'Search tabs, statements, contracts, FAQ…',
  'header.search_label': 'Search…',
  'header.app_label': 'Author Portal',

  'cmd.placeholder': 'Search tabs, statements, contracts, FAQ…',
  'cmd.no_results': 'No results',
  'cmd.group_navigation': 'Navigation',
  'cmd.group_payments': 'Statements',
  'cmd.group_contracts': 'Contracts',
  'cmd.group_faq': 'FAQ',
  'cmd.hint_open_tab': 'Open tab',

  'pdf.download': 'Download',
  'pdf.loading': 'Loading PDF…',

  'tabs.start': 'Start',
  'tabs.payments': 'Statements',
  'tabs.contracts': 'Contracts',
  'tabs.forecast': 'Forecast',
  'tabs.expenses': 'Expenses',
  'tabs.faq': 'FAQ',
  'tabs.profile': 'Profile',

  'onboarding.banner_blocking_title': 'Complete your details to activate your account',
  'onboarding.banner_blocking_text':
    "We're still missing some details required for activation: address, IBAN, BIC and/or BSN. Without this information Noordhoff cannot activate your account. Please fill in the missing fields on your profile page below.",
  'onboarding.banner_softmissing_title':
    'Your details are complete — Noordhoff will activate your account shortly',
  'onboarding.banner_softmissing_text':
    'Thank you for completing your profile. Your account will be activated as soon as possible. Phone number and date of birth can still be filled in at your convenience via your profile page below.',
  'onboarding.banner_pending_review_title': 'Your request is being processed',
  'onboarding.banner_pending_review_text':
    'Thank you for completing your profile. Noordhoff is now processing your details — this usually takes a few working days. Once your account is active, all sections of the portal will become available automatically. You will be notified by email.',
  'onboarding.tab_disabled_tooltip': 'Available once your account is activated',
  'onboarding.activate_button': 'Submit details',
  'onboarding.activate_button_disabled_hint':
    'Please fill in all required fields before submitting your request.',
  'onboarding.activate_confirmation':
    'Your request has been sent. You will receive an email once your account is activated.',
  'onboarding.save_intermediate': 'Save progress',
  'onboarding.readonly_disclaimer':
    'Your request is being reviewed. Changes cannot be made at this time.',
  'onboarding.required_field_hint': 'Required',
  'onboarding.missing_fields_count': '{count} field(s) remaining',
  'onboarding.progress_step1_label': 'Complete profile',
  'onboarding.progress_step2_label': 'Noordhoff review',
  'onboarding.progress_step3_label': 'Portal fully active',
  'onboarding.tab_lock_short': 'available later',

  'profile.title': 'Your details',
  'profile.id_vendor': 'Vendor ID',
  'profile.id_alliant': 'Alliant ID',
  'profile.label_firstname': 'First name',
  'profile.label_lastname': 'Last name',
  'profile.label_email': 'Email address',
  'profile.label_phone': 'Phone number',
  'profile.label_address': 'Address',
  'profile.label_postcode': 'Postal code',
  'profile.label_city': 'City',
  'profile.label_country': 'Country',
  'profile.label_birthdate': 'Date of birth',
  'profile.label_bsn': 'BSN',
  'profile.label_iban': 'IBAN',
  'profile.label_bic': 'BIC',
  'profile.bsn_show': 'Show BSN',
  'profile.bsn_hide': 'Hide BSN',
  'profile.bsn_immutable_hint': 'BSN cannot be changed. For corrections: rights@noordhoff.nl.',

  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',
  'greeting.night': 'Good night',

  'start.kpi.total_paid': 'Total paid out',
  'start.kpi.this_year': 'This year',
  'start.kpi.statements_count': 'Number of statements',
  'start.kpi.last_payment': 'Last statement',
  'start.recent_title': 'Recent statements',
  'start.events_title': 'Upcoming events',
  'start.news_title': 'Latest news',
  'start.year_review_badge': 'Year in review',
  'start.total_since': 'Total since',
  'start.last_payment': 'Last payment',
  'start.expected_next': 'Expected',
  'start.tba': 'To be announced',
  'start.royalty_overview': 'Royalty overview',
  'start.amounts_pending': 'Amounts not yet entered',
  'start.academy_label': 'ACADEMY',
  'start.academy_desc': 'Workshops, didactics and digital tools to deepen your authorship.',
  'start.paid_in_year': 'Paid out in {year}',
  'start.expected_in_year': 'Expected in {year}',
  'start.yoy_vs': 'vs {prevYear}',
  'start.on_date': 'On {date}',
  'common.not_available_dash': '—',

  'payments.title': 'Royalty statements',
  'payments.empty': 'No statements available.',
  'payments.download': 'Download',
  'payments.missing_pdf': 'PDF missing',
  'payments.search_placeholder': 'Search by title, date or amount…',

  'contracts.title': 'Your contracts',
  'contracts.empty': 'No contracts registered.',
  'contracts.contact_text':
    'For questions about your contract, please contact rights@noordhoff.nl.',
  'contracts.search_placeholder': 'Search by name or number…',
  'contracts.stat_active': 'Active contracts',

  'forecast.title': 'Expected royalties',
  'forecast.empty': 'No forecast available.',
  'forecast.range_label': 'Expected amount',
  'forecast.disclaimer':
    'Indicative forecast. The actual amount may differ based on final sales figures and contract changes.',
  'forecast.pending_headline': 'Not yet available',
  'forecast.pending_sub_part1': 'The forecast is published annually on ',
  'forecast.pending_sub_part2':
    ', after annual revenue processing. Once the forecast for {year} is ready, you will find the expected royalty range here.',
  'forecast.publish_date_label': 'Publication date',
  'forecast.auto_notify': 'You will be notified automatically.',
  'forecast.history_title': 'Payments per year',
  'forecast.range_sub': 'Indicative range',
  'forecast.payout_label': 'Payment',
  'forecast.eyebrow_year': 'Expected royalties {year}',
  'forecast.payout_month': 'March {year}',

  'expenses.title': 'Expenses',
  'expenses.new_title': 'Submit a new expense',
  'expenses.field_description': 'Description',
  'expenses.field_amount': 'Amount (€)',
  'expenses.field_type': 'Type',
  'expenses.field_receipt': 'Receipt (PDF)',
  'expenses.submit': 'Submit',
  'expenses.history_title': 'Submitted expenses',
  'expenses.history_empty': 'You have not submitted any expenses yet.',
  'expenses.status_pending': 'Pending',
  'expenses.status_approved': 'Approved',
  'expenses.status_rejected': 'Rejected',
  'expenses.status_paid': 'Paid',
  'expenses.vendor_id_label': 'Mention your Vendor ID on the form:',
  'expenses.rules_heading': 'Before submitting: read the guidelines',
  'expenses.dropzone_text': 'Drag a PDF here or click to select',
  'expenses.dropzone_hint': 'PDF only, max 10 MB',
  'expenses.history_download': 'View PDF',
  'expenses.download_heading': '1. Download the correct form',
  'expenses.upload_heading': '2. Upload the filled-in form as PDF',
  'expenses.types_help_summary': 'Which form should I use?',
  'expenses.form_onkosten_title': 'Expense form',
  'expenses.form_onkosten_desc': 'Travel · office · incidental',
  'expenses.form_onkosten_explanation':
    'For all standalone, non-project expenses you made for Noordhoff: travel (car/public transport), small office costs (ink, supplies) and incidental costs. Always attach the original receipts or invoices in the PDF. Kilometers are reimbursed per ANWB route planner at €0.21/km.',
  'expenses.form_idc_title': 'Project costs (IDC)',
  'expenses.form_idc_desc': 'Editorial · project-based work',
  'expenses.form_idc_explanation':
    'For work invoiced as part of a project: editorial work, project-based authorship, lesson-development assignments or any cost linked to an ongoing IDC (Internal Development Cost) project. Always include the PO number on the form, otherwise Noordhoff cannot allocate the cost to a budget.',
  'expenses.form_idc_required_hint': 'Always include the PO number',
  'expenses.rule_originals_title': 'Original receipts or invoices',
  'expenses.rule_originals_text': 'always include with the declaration.',
  'expenses.rule_pdfonly_title': 'Digital PDF only',
  'expenses.rule_pdfonly_text':
    'declarations can only be submitted as PDF via this portal. Physical declarations or MS Word/Excel files will not be processed.',
  'expenses.rule_km_title': 'Mileage allowance',
  'expenses.rule_km_text': 'report per ANWB route planner at 21 cents per kilometer.',
  'expenses.rule_btw_title': 'VAT (omzetbelasting)',
  'expenses.rule_btw_text':
    'use this form only if you are not registered as a VAT entrepreneur. If you are, send your own invoice including at minimum the "brand" and "cost center".',
  'expenses.error_no_file': 'Please select the filled-in form as PDF.',
  'expenses.error_not_pdf': 'Only PDF files allowed.',
  'expenses.error_too_large': 'File exceeds 10 MB.',
  'expenses.error_no_session': 'No active session. Please sign in again.',
  'expenses.error_upload_failed': 'Upload failed',
  'expenses.error_insert_failed': 'Submission failed',
  'expenses.uploading': 'Uploading…',
  'expenses.sending_mail': 'Sending to Noordhoff…',
  'expenses.success': 'Declaration submitted and emailed to rights@noordhoff.nl.',
  'expenses.success_no_mail':
    'Declaration saved in the portal, but the email to Noordhoff could not be sent. Noordhoff will still see the declaration via the admin overview.',

  'faq.title': 'Frequently asked questions',
  'faq.intro': 'Answers to the most common questions about royalties, contracts and the portal.',

  'common.busy': 'Working…',
  'common.close': 'Close',

  'profile.changes_heading': 'Request changes',
  'profile.changes_intro':
    'Changes are reviewed by Noordhoff. They become permanent only after approval.',
  'profile.changes_empty': 'No changes made.',
  'profile.changes_saved': 'Changes saved.',
  'profile.changes_nothing': 'Nothing to change.',
  'profile.pending_change_badge': '⏳ change pending: {value}',
  'profile.changes_submitted': '{count} change(s) submitted. Noordhoff will review them.',

  'admin.section_overline': 'Management',
  'admin.section_heading': 'Author management',
  'admin.empty_filter': 'No authors in this filter.',
  'admin.tab_accounts': 'Accounts',
  'admin.tab_persoonsgegevens': 'Personal details',
  'admin.card_add_authors_title': 'Add authors',
  'admin.card_bulk_statements_title': 'Upload royalty statements',
  'admin.action_help_summary': 'How does this work?',

  'admin.card_add_authors_help_intro':
    'Authors arrive in the portal in two ways. Which route you pick depends on whether the author is already registered with Noordhoff.',
  'admin.card_add_authors_help_existing_label': 'Existing authors (via "Import Excel")',
  'admin.card_add_authors_help_existing_text':
    'Authors who are already known to Noordhoff and present in NetSuite. Export them as Excel from NetSuite (Vendor-list export, 12 columns) and upload the file here. All accounts are created in one go WITH the existing NetSuite data — name, address, IBAN, BIC, BSN, date of birth — pre-filled. This is the default route for your initial population and for periodic updates whenever NetSuite adds new authors.',
  'admin.card_add_authors_help_new_label': 'New authors (via "New author")',
  'admin.card_add_authors_help_new_text':
    'Authors who are NOT yet known to Noordhoff — exceptions such as new contracts not yet processed in NetSuite. Enter only email, first and last name. The author then signs in and fills in their remaining profile details (address, IBAN, BSN, date of birth) via the portal. Those changes appear in the "Personal details" tab under "Pending change requests" for your approval.',
  'admin.card_add_authors_help_outro':
    'In both cases the account starts with the initial password "Noordhoff" which the author changes at first sign-in. Only when you click "Activate" in the authors list does the author receive a notification that they can sign in. Mails are off during the test phase — inform test authors personally.',

  'admin.card_bulk_statements_help_intro':
    'A bulk upload requires TWO files uploaded together: the statement PDFs and an Excel with the matching amounts. Below how each one should look.',
  'admin.card_bulk_statements_help_pdf_heading': 'File 1 — Statement PDFs',
  'admin.card_bulk_statements_help_pdf_para':
    'One PDF per author per month. The Alliant ID in the filename is matched automatically against an author in the portal — make sure that ID is correct, otherwise the statement ends up without an owner.',
  'admin.card_bulk_statements_help_filename_label': 'Filename convention:',
  'admin.card_bulk_statements_help_example_label': 'Example:',
  'admin.card_bulk_statements_help_excel_heading': 'File 2 — Amounts Excel',
  'admin.card_bulk_statements_help_excel_para':
    'One Excel file with the amounts per author (the PDF itself contains no machine-readable total). The first row must contain exactly these three headers in this order:',
  'admin.card_bulk_statements_help_empty_cell': '(empty)',
  'admin.card_bulk_statements_help_col_alliant':
    "Author's Alliant ID (required). Must match the ID in the PDF filename.",
  'admin.card_bulk_statements_help_col_amount':
    'Euro amount for this statement. Decimal comma (1,234.56) or dot (1234.56) both work. Rounded to 2 decimals.',
  'admin.card_bulk_statements_help_col_yyyymm':
    "Specific month (six digits, YYYYMM). Leave empty = amount applies to ALL of that author's PDFs in this batch — convenient when you want one amount per author per upload. For month-specific amounts, fill this column.",
  'admin.card_bulk_statements_help_outro':
    'Select both files together → click "Show preview" → check the table of author-matches → confirm. Duplicate uploads of the same PDF are automatically skipped.',
  'admin.toolbar_excel_import': 'Import existing authors',
  'admin.toolbar_bulk_statements': 'Upload Statements',
  'admin.toolbar_csv_export': 'Export to NetSuite',
  'admin.toolbar_new_author': 'Import new author',
  'admin.tooltip_excel_import':
    'Create multiple authors at once from the NetSuite Vendor export. For authors who already exist at Noordhoff with their data filled in.',
  'admin.tooltip_bulk_statements':
    'Upload multiple royalty statement PDFs at once. Authors are matched via Alliant ID in the filename (NU_SC_<id>_<name>_<YYYYMM>.pdf).',
  'admin.tooltip_csv_export':
    'Generate a CSV with all author data changed since the previous export. For syncing back to NetSuite.',
  'admin.tooltip_new_author':
    'Add a single author manually. For exceptions that don\'t come via the bulk Excel import. Account is created with initial password "Noordhoff" and must be activated later.',
  'admin.tooltip_send_reminder':
    'Remind the author to complete their profile details. During test phase: audit log only, no email.',
  'admin.tooltip_activate':
    'Activate this account. The author receives an email that they can sign in. During test phase: no email; inform the author personally.',
  'admin.tooltip_reset_mfa':
    "Remove this author's 2FA settings. At their next sign-in they'll need to set up an authenticator app again. Use this if the author lost their device.",
  'admin.filter_all': 'All',
  'admin.btn_send_reminder_label': 'Send reminder to author',
  'admin.btn_activate': 'Activate',
  'admin.btn_reset_mfa': 'Reset 2FA',
  'admin.confirm_reset_mfa':
    'Reset 2FA for {name}? At their next sign-in, the author will need to set up an authenticator app again.',
  'admin.reset_mfa_success': '2FA reset for {name} ({count} factor(s) removed).',
  'admin.reset_mfa_failed': '2FA reset failed',
  'admin.status_admin': 'Admin',
  'admin.status_persoonsgegevens': 'Inactive — Personal details still to be added',
  'admin.status_persoonsgegevens_short': 'Personal details to be added',
  'admin.status_statements': 'Inactive — Statements still to be added',
  'admin.status_statements_short': 'Statements to be added',
  'admin.status_gereed': 'Inactive — Ready for activation',
  'admin.status_gereed_short': 'Ready for activation',
  'admin.status_actief': 'Active',
  'admin.status_actief_short': 'Active',
  'admin.card_export_title': 'Export to NetSuite',
  'admin.card_export_help_intro':
    'Authors change their own profile details (address, IBAN, phone) via the portal. Those changes are collected here for periodic sync back to NetSuite, keeping the financial administration up-to-date.',
  'admin.card_export_help_workflow':
    'Click "Export to NetSuite" → a CSV is generated with all data changed or activated since the previous export → the file is downloaded automatically. Upload it to Noordhoff SharePoint within minutes so the NetSuite team can import it. Delete the local copy afterwards (contains personal data).',
  'admin.card_export_help_safety':
    'A timestamp is recorded per author per export so the same change is never reported twice. A second click then yields "No changes since previous export".',
  'admin.created_at': 'Created {date}',
  'admin.invited_at': 'Invited {date}',
  'admin.reminder_at': 'Reminder {date}',
  'admin.activated_at': 'Activated {date}',

  'admin.new_author_heading': 'New author',
  'admin.new_author_intro':
    'Enter email + name. The account is created with the initial password "Noordhoff". Share it personally with the author — at first login they\'ll choose their own password and then set up 2FA. No emails are sent during the test phase.',
  'admin.new_author_field_email': 'Email',
  'admin.new_author_field_firstname': 'First name',
  'admin.new_author_field_lastname': 'Last name',
  'admin.new_author_field_vendor': 'Vendor ID (optional)',
  'admin.new_author_submit': 'Create & invite',

  'admin.excel_import_heading': 'Import existing authors from NetSuite Excel',
  'admin.excel_import_intro':
    'Upload the NetSuite Vendor export (12 columns, including Date of Birth). For each row, an account is created with the initial password "Noordhoff". No emails are sent during the test phase.',
  'admin.excel_import_file_label': 'Excel file',
  'admin.excel_import_submit': 'Import',
  'admin.excel_import_close': 'Close',
  'admin.excel_import_stat_created': 'Created',
  'admin.excel_import_stat_skipped': 'Skipped',
  'admin.excel_import_errors_heading': 'Errors ({count})',
  'admin.excel_import_no_file': 'Please select an Excel file first.',
  'admin.excel_import_empty': 'No rows found in the Excel file.',
  'admin.excel_import_failed': 'Import failed',
  'admin.excel_import_no_response': 'No response received from Edge Function.',
  'admin.excel_import_unexpected': 'Unexpected error',

  'admin.bulk_stmt_heading': 'Bulk upload royalty statements',
  'admin.bulk_stmt_intro':
    'Upload multiple NU_SC_*.pdf files at once plus an Excel with the matching amounts (columns: alliant_id, amount, yyyymm). Authors are matched automatically via their Alliant ID.',
  'admin.bulk_stmt_type_label': 'Statement type',
  'admin.bulk_stmt_type_royalty': 'Royalty',
  'admin.bulk_stmt_type_subsidiary': 'Subsidiary rights',
  'admin.bulk_stmt_type_foreign': 'Foreign rights',
  'admin.bulk_stmt_type_jaaropgave': 'Annual statement',
  'admin.bulk_stmt_pdf_label': 'Statement PDFs (multiple selectable)',
  'admin.bulk_stmt_amounts_label': 'Amounts Excel (alliant_id, amount, yyyymm)',
  'admin.bulk_stmt_preview_btn': 'Show preview',
  'admin.bulk_stmt_no_pdfs': 'Please select at least one PDF.',
  'admin.bulk_stmt_no_amounts': 'Please select an amounts Excel.',
  'admin.bulk_stmt_pdf_too_large': 'File "{file}" exceeds {max} MB.',
  'admin.bulk_stmt_batch_too_large':
    'Selected batch totals {mb} MB — that may load slowly in the browser. Consider splitting it.',
  'admin.bulk_stmt_unexpected': 'Unexpected error',
  'admin.bulk_stmt_group_ready': 'Ready for upload',
  'admin.bulk_stmt_group_duplicate': 'Already present',
  'admin.bulk_stmt_group_error': 'Issue',
  'admin.bulk_stmt_status_ready': 'Ready for upload',
  'admin.bulk_stmt_status_no_author':
    'No author found for Alliant ID {id}. Create the author first via "Import Excel".',
  'admin.bulk_stmt_status_duplicate':
    'Statement already exists for this author + period — will be skipped.',
  'admin.bulk_stmt_status_no_amount':
    'Amount missing for Alliant ID {id}. Add a row to the amounts Excel.',
  'admin.bulk_stmt_upload_btn': 'Upload {count} statements',
  'admin.bulk_stmt_uploading': 'Uploading…',
  'admin.bulk_stmt_result_succeeded': 'Succeeded',
  'admin.bulk_stmt_result_skipped': 'Skipped',
  'admin.bulk_stmt_result_failed': 'Failed',
  'admin.bulk_stmt_result_errors_heading': 'Details ({count})',

  'admin.csv_export_heading': 'Export to NetSuite',
  'admin.csv_export_intro':
    'Generates a CSV containing all author data changed or newly activated since the previous export. The file is downloaded — upload to Noordhoff SharePoint within minutes and delete locally.',
  'admin.csv_export_reason_label': 'Reason / note (optional — saved in audit log)',
  'admin.csv_export_reason_placeholder': 'e.g. Weekly NetSuite sync',
  'admin.csv_export_submit_count': 'Export & download ({count} rows)',
  'admin.csv_export_submit': 'Export & download',
  'admin.csv_export_no_changes': 'No changes since the previous export.',
  'admin.csv_export_summary_count': '{count} author(s) will be included:',
  'admin.csv_export_row_more': '… and {count} more',
  'admin.csv_export_success_heading': 'Export complete',
  'admin.csv_export_success_text':
    'Upload this CSV to Noordhoff SharePoint and delete locally. Audit log:',
  'admin.csv_export_row_new': 'new',
  'admin.csv_export_row_changed': 'changed',

  'admin.statement_upload_heading': 'Upload new statement',
  'admin.statement_upload_field_type': 'Type',
  'admin.statement_upload_field_file': 'PDF file',
  'admin.statement_upload_submit': 'Upload',
  'admin.statement_upload_busy': 'Uploading…',

  'admin.changes_heading': 'Pending change requests',
  'admin.changes_empty': 'No pending requests.',
  'admin.changes_approve': 'Approve',
  'admin.changes_reject': 'Reject',
};
