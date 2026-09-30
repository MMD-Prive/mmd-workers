# Kenji SVIP Photo Reveal — Network Drop Recovery Runbook

Status: OWNER PILOT RECOVERY RUNBOOK  
Owner: Per / MMD Privé  
Applies to: SVIP exact-customer approved-photo reveal  
Related PR: #2154  
Related pilot gate: `docs/ops/KENJI_SVIP_PHOTO_REVEAL_PILOT_GATE_20260930.md`

## Why this runbook exists

The private preview intentionally uses a one-use atomic consume gate.

A failure can happen after `POST /consume` has committed but before the customer's device visibly renders the image, for example:

- mobile data drops;
- Wi-Fi changes;
- LINE is force-closed;
- the browser/webview crashes;
- the device loses connectivity while receiving the response.

The system cannot safely prove that rendered pixels were seen by the person. Therefore:

- a consumed grant stays consumed;
- the original token is never reactivated;
- `view_count` is never reset;
- Durable Object consumed state is never cleared;
- the customer does not receive an automatic replay window.

Recovery is an explicit Per decision.

## Customer-facing principle

Do not argue that the customer "already saw it" merely because the backend recorded a consume.

Use neutral recovery wording in Per voice:

> สิทธิ์เปิดครั้งนั้นสิ้นสุดไปแล้วครับ ถ้ารูปยังไม่ขึ้นจริง เดี๋ยวผมตรวจรายการเดิมให้ แล้วออกลิงก์ใหม่ให้เฉพาะรูปชุดเดิมครับ

Do not ask the customer to troubleshoot MY MMD or understand grant/token state.

## Recovery eligibility

Per may issue a replacement only when all checks pass:

1. The customer is still the exact Canonical Client tied to the original grant.
2. Current canonical entitlement still has active SVIP reveal eligibility.
3. Original Grant is the SVIP exact-customer photo policy.
4. Original Grant is already consumed exactly once.
5. The Consumption Log exists and links the same Client / Model / Media Asset.
6. Customer reports that the media did not visibly render, or the pilot tester intentionally executed the network-drop case.
7. No client/model `block`, `caution`, `no-sell`, or active sales-control OFF rule appeared after the original issuance.
8. The replacement contains only the same approved Model/Media set; it cannot reveal extra media.
9. Rollout mode is still `pilot` or `live`. If mode is `off` or `dry_run`, stop.
10. Per explicitly approves the recovery.

If any check is uncertain, do not reissue. Treat it as review-required.

## Recovery procedure

### 1. Preserve the original evidence

Record:

- original `grant_id`;
- original Grant Airtable record;
- Client record;
- Model record;
- Media Asset record(s);
- original `issued_at`;
- original LINE event ref;
- original `consumed_at`;
- original Consumption Log record;
- current rollout mode;
- time the customer reported the failure.

Do not modify the original Grant.

### 2. Classify the incident

Use:

- `recovery_reason = delivery_failure_after_consume`
- `recovery_type = owner_manual_reissue`

For pilot testing also record:

- device: iPhone / Android;
- LINE app version if available;
- OS version if available;
- network transition attempted;
- whether the image ever visibly rendered.

### 3. Re-run current gates

Before issuing anything new, re-resolve:

- Canonical Client;
- active SVIP capability;
- Model exact match;
- Keyword Profile visibility policy;
- approved + private-safe media;
- client/model caution and block state;
- Model Sales Control no-sell state;
- rollout mode.

Historical approval is not sufficient if current truth changed.

### 4. Create a new grant

Recovery must create a **new grant**, new token, new expiry and new one-use gate.

The new grant must remain:

- exact Client bound;
- exact Model bound;
- same Media Asset set only;
- 30-minute expiry;
- one-use;
- private-preview only;
- no protected rate / sales offer / availability / booking / payment authority.

Never reset or reuse the original grant.

### 5. Record the recovery relation

The replacement Grant or its owner audit note must include:

- `reissue_of_grant_id = <original grant_id>`
- `reissue_reason = delivery_failure_after_consume`
- `reissue_authorized_by = Per`
- `reissue_authorized_at = <timestamp>`
- `original_consumed_at = <timestamp>`
- `customer_reported_at = <timestamp>`
- exact original Client / Model / Media identifiers

If the current UI/runtime cannot persist these fields automatically, record them in the owner pilot evidence before sending the replacement. That limitation blocks `live` until Per accepts the operational recovery method or a durable runtime field is added.

### 6. Send replacement

Send only through LINE OFC in Per voice.

Do not send:

- Drive folder;
- R2/raw object URL;
- original consumed URL;
- admin URL;
- internal record IDs to the customer.

### 7. Close the incident

After the replacement is opened or expires, capture:

- replacement `grant_id`;
- whether media visibly rendered;
- replacement Consumption Log if consumed;
- final outcome: `recovered`, `replacement_expired`, or `customer_declined`.

## Abuse / repeat-failure rule

A second claimed delivery failure on the replacement is **not** automatically reissued.

Stop and require Per review. Check:

- device/webview behavior;
- LINE/Safari/Chrome path;
- network conditions;
- whether the media response completed;
- whether there is a repeated technical defect that should stop pilot.

If the same technical failure reproduces more than once, return rollout mode to `off` and investigate before continuing pilot.

## Audit minimum for pilot PASS

One intentional network-drop pilot must produce evidence of:

1. original issuance;
2. exactly one original consumption event;
3. original grant remains consumed;
4. Per recovery approval;
5. replacement exact-client grant;
6. explicit relation to original grant and reason;
7. replacement success or expiry;
8. no extra media / entitlement / protected action.

## LIVE gate

Do not enable `live` until Per has successfully executed this runbook at least once in pilot on a real mobile device and confirmed that the recovery evidence is operationally readable.
