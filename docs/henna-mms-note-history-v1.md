# HENNA MMS customer history from LINE OA Notes and hashtags

Per confirmed on 4 October 2026 that MMS customer history means customers who used MMS services, identified using existing LINE OA @malemassage Notes, Per rename and customer hashtags, following the MMD history review pipeline. This change replaces contact-event capture; the LINE webhook is unchanged.

## Source and identity

Use an authorized capture/export of customer Notes and chats from @malemassage, preserving stable note/message references, LINE user ID, current rename and existing hashtags. Do not use the Male Massage crew room as a substitute for customer OA Notes. Cross-OA imports with an explicit different account are rejected. Name and hashtags are evidence/discovery hints; missing or ambiguous canonical customer bindings stay in review. Existing hashtags are preserved, not replaced with a new marketing tag scheme.

The existing MMS importer now accepts line_hashtags/customer_hashtags arrays as well as the MMD line_tags_raw/tags aliases, retains long multiline Notes and defaults OA Notes to service-history evidence. A historical Note containing an amount is not automatically a customer payment proof. Explicit payment/payout intake remains supported separately.

## Finance rule

Full amount = course fee + travel fee. MMS share = 30% of that full amount; Therapist share is the 70% remainder. Calculate in satang; round the MMS share to the nearest satang, assign the remainder to Therapist. This describes expected distribution, not verified payout or net profit after other expenses.

For one reviewed visit, accept structured course_amount_thb, travel_amount_thb, full_amount_thb, mms_share_thb and therapist_share_thb, or explicit Thai/English amount labels in the Note. Missing travel is unknown, not zero. Missing amounts, conflicting figures, repeated labels/multiple visits and mismatched shares are review-required. A Note with several visits must be split into original event references and reviewed individually. Do not count deposits and balances as additional revenue.

The financial audit is preserved inside staging raw_row_json and customer_detail_json using existing fields. No MMD points are automatically proposed from MMS finance, and no payments, payouts or membership are marked verified. Review gates and the existing materializer remain necessary.

## Six-year backfill target

Target source period: 4 October 2020 through 4 October 2026 (Asia/Bangkok). Importer has no short history cutoff. Gather actual customer Notes, authorized chat captures/exports and payment evidence; compare them by original visit/reference rather than treating conversation text as a completed service. Retain earlier material if available.

Before claiming completeness, inventory source files and their actual first/last dates, identify missing months/customers, deduplicate overlapping exports, and check every visit's course/travel/full/share/payment fields. An export spanning six years is not proof that every message or transaction is present. LINE Messaging API is not assumed to export OA Notes or historical chats.

Run the existing mms-history-evidence-intake.js with --source line_ofc and an authorized JSON/CSV evidence file. Inspect its finance_audit and existing canonical-match plans before staging with --apply-evidence. Preserve evidence in private operator access only. Use the existing history review queue and materializer for approved MMS events; the LIFF MMS history reader exposes only approved completed MMS jobs for the resolved customer.

## Current limits

This PR contains parser/intake/audit changes and regression tests. No live Notes/hashtags have been read or edited, no six-year archive has been imported, no production deployment has occurred, and no customer announcement has been sent. Automatic OA Note/hashtag writing and the archived-chat capture source are not implemented here.
