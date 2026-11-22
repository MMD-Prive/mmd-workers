# Red Card schema repair — 22 November 2026

Customer signup-link distribution remains paused until the end-to-end release gates below pass.

## Airtable repair

In MMD Commerce Operating System (`appsV1ILPRfIjkaYg`), table MMD — Member Entitlements (`tblNImdF9PKAxhXGi`), created the missing writable `membership_term` field as `singleLineText`, ID `fldzPgH2ZEnWMdWy4`.

The deployed Official Verify writer emits labels such as `2_years`; actual validity uses `start_at` and `expire_at`, with `membership_expiry_rule` retaining anniversary semantics. Those three fields already existed. After creation, a fresh schema read confirmed all 19 field names emitted by `entitlementFields()` exist. No existing member, payment, entitlement, or customer record was read or modified for this repair; no real payment was made.

Field existence is not an end-to-end write test. The writer uses Airtable typecasting; the legacy select catalogs do not explicitly list every emitted value (`member_status=active`, `package_code=red_card`, `entitlement_level=red_card`). Verify the actual writer credential can accept the exact payload in an isolated synthetic environment before reopening distribution.

## Admin status

PR #3239 repaired the verified Partner relationship test fixture and merged as `367f0a8f80bb7fb86da99061f5bbf43b1871ffc5`. Production Admin deployment run https://github.com/MMD-Prive/mmd-workers/actions/runs/45005519536 succeeded, including tests, version deployment, route verification and verified-live receipt. The previously failed run is superseded.

## Remaining release gates

- Run an isolated, non-production Official Verify write and read back the two-calendar-year entitlement, then replay its payment reference and confirm no extension or duplicate. Mock tests and schema reads do not replace this check.
- Correct the active `/pay/membership` Webflow main embed: page `6a70c99f1b2b686c83001271`, embed `8466d573-3dd8-dbf6-8a65-a4bea41ddcfe`. Desktop/mobile copy and term badges must say 2 years, ฿11,499 paid once, approximately ฿479/month for comparison. The checked-in HTML is a preceding skin. Webflow edit/publish remains a separate action; preserve `/member/membership`.
- Keep customer signup links paused until both gates pass. This note does not implement a server-side purchase pause.
