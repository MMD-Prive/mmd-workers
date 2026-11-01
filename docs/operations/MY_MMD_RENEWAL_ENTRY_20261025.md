# MY MMD renewal entry and retired price cleanup — 25 October 2026

Status: source patch only; no merge, deployment, production flag enablement or transaction.
Base: `0825eaabfbb4f55e234eb033420f96d606952cc2`.

## Confirmed owner request

- Correct route: `/sigil/pay/renewal` (not `/sigil/par/renewal`).
- Open Renewal inside MY MMD first, then server-issued LINE checkout.
- Standard signup 1,199 THB/year; renewal 1,000 THB when eligible service spend reaches 10,000 THB in 365 days.
- Premium signup 2,999 THB/year; renewal 2,500 THB when eligible service spend reaches 20,000 THB in 365 days.
- Retired 799 / 1,999 THB renewal offers must not be used again.

## Implemented in this bounded patch

1. Unsigned `/sigil/pay/renewal` and `/pay/renewal` go directly to the owner-supplied MY MMD permanent link with fixed `intent=renew`, `view=package` and `world=private` hints.
2. Signed links retain `/sigil/pay?t=<same token>` and never expose that token to LINE.
3. Remove the obsolete spend-band table from the compatibility quote helper, including its lower high-spend bands. The helper cannot revive retired offers at any spend level.
4. Preserve existing fixed-price resolver, membership term, promotion, verification and settlement behavior. This cleanup does NOT implement the new 365-day eligibility policy or approve a below-threshold renewal price.
5. Preserve historic payments and payment-intelligence mappings needed to recognize old evidence. Historical amount recognition is not a sellable catalog or payment authorization.

## Remaining release work — do not hide it

- Replace the current-package-only UI/API restriction with reviewed package selection and correct tier-change settlement semantics.
- Read verified eligible service spend with 365-day coverage. Do not treat missing/incomplete history as zero, and do not require retroactive slips merely because one is absent.
- Keep membership fees separate from eligible service spend; no automatic Points or payment writes from imported history.
- Decide zero-spend / below-threshold renewal pricing separately. A previously paid member is not a first-time member merely because no service was used.
- Reconcile the requested annual signup wording and all live term/promotion sources before enabling a new catalog; do not silently use older Drive rules.
- Keep `LIFF_RENEWAL_CARD_ENABLED` unchanged. Verify production configuration separately; repository defaults do not prove live values.
- Test authenticated LINE login/return, package selection, signed checkout, pending resume, official verification, expiry and idempotency on iOS and Android.
- No customer messages, real payment intents, membership extensions, Points changes, merge or deployment in this task.

## Local verification actually run

Node v22.16.0:

```sh
node --check member-dashboard-chat-worker/src/renderers/single-renewal-renderer.js
node --check member-dashboard-chat-worker/test/renewal-route.test.mjs
node --check member-pages-worker/src/renewal-offer.js
node --test member-dashboard-chat-worker/test/renewal-entry-liff.test.mjs member-pages-worker/test/renewal-offer.test.mjs
```

Result: 18 tests passed, 0 failed.
The unmodified `shared/membership-promotion-policy.mjs` dependency was copied from the pinned source and its Git blob hash matched `6106832c422338c5dbf74f7fa86aa478a0317385`.
The existing worker-entrypoint integration test was updated for the new target, but was NOT executed locally: the full repository could not be cloned because this runtime could not resolve GitHub. No full-suite or real-phone success is claimed.
A public live URL read was also unavailable through the web reader; no production redirect claim is made.
