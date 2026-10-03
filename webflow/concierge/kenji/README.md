# /concierge/kenji

Mobile-first Thai concierge entry with inline chat, quiet charcoal/champagne/ivory styling, and a compact persistent membership/expiry/Points summary. LV5 describes UX quality, not a membership tier.

## Source and transport

- `kenji-concierge-v3.html`: Webflow Embed.
- `kenji-concierge-v3.css`: Page Settings head; includes its style wrapper.
- `kenji-concierge-v3.js`: Before body; includes its script wrapper.
- Profile: credentialed no-store `GET /member/api/liff/profile`.
- Chat: existing authenticated `POST /api/member/kenji/chat` with `{message}` only, exactly as the current `/member/kenji` app. The BFF verifies Member App session truth and delegates to the current AI worker; the frontend creates no new session, credentials, AI model or customer record.

Quick prompts prepare text and focus the composer; only Send submits. Enter creates a newline. A busy guard prevents double-click sends. Failed/ambiguous delivery retains the draft and never reports sent. There is no automatic retry. The current BFF returns a complete JSON reply, not a stream, and has no transcript/history endpoint. Reload starts an empty local transcript; clearing chat deletes only the local display. Visibility/pagehide and lost-session states clear private local data.

The configured LIFF response uses flat `data.tier`, `data.membership_expires_at` and numeric `data.points`. Points require the existing `lot_365d_from_entry` policy and matching verified `customer_360.points` guard, not unguarded resolver totals; missing, pending and malformed values remain unknown. If profile points cannot be verified, a points-intent chat response cannot turn that unknown into an invented zero. Membership level does not grant private access or personal promo eligibility. Server actions are rendered as text with relative first-party links. Query `t` is retained for existing verification/booking handoffs and never substituted for a chat credential. Existing section hash targets remain supported.

## Verification and acceptance

See [QA evidence](qa/README.md), [browser checks](qa/browser-results.json), and the focused read-only GitHub Actions workflow. All screenshots use mocked data and the existing public Kenji portrait.

The existing member BFF does **not** expose or enforce cross-channel owner takeover. UI handling of HTTP 423 / explicit takeover errors is defensive and mock-tested; it is not proof that LINE owner takeover is enforced. No automatic-assistance claim is made. General promotions currently fall through to the BFF's generic intent; the prompt and MY MMD coupons link do not claim a factual promo response. Renewal remains read-only guidance and membership navigation, not a submitted renewal intake. These are release acceptance gaps, not new backend implementations.

## Published-page drift and safe reconciliation

A read-only public GET on 2026-10-03 found `#kenji-concierge-v5` and `data-chat-endpoint="/concierge/kenji/message"` in the HTML served by **published production** at `https://www.mmdbkk.com/concierge/kenji`. That v5 source/endpoint implementation is not present in this GitHub checkout. This is a published-to-GitHub source mismatch; no claim is made about the current Designer or staged custom-code state.

Before separately authorized publication:

1. Export/review the currently published and Designer HTML/head/body custom code, including v5 language controls, token links and global member scripts. Preserve a rollback snapshot.
2. Reconcile those differences with this PR and confirm the intended current Kenji transport. Do not blindly paste tracked v3 over v5 or leave both initializers active.
3. Verify existing session access on apex/www with test accounts and the same BFF. Resolve authoritative cross-channel takeover and approved general-promo capabilities through existing authorities before claiming assistance while Per is away; do not infer availability from screen activity.
4. Paste the reviewed embed/head/body as one matched revision only after authorization, retaining `viewport-fit=cover` in the host page's viewport configuration. Test the actual Webflow shell, native mobile keyboard/safe-area and public/private boundaries before any publication decision.

No merge, deployment, route change, Webflow edit/publication or live customer message was performed.

## Compact page staging follow-up

Use the main HTML embed, page-head CSS, page-footer JS and secondary `kenji-concierge-v3-shell.html` embed as a matched revision. The shell embed scopes body margin/duplicate global account badge suppression to this page and adds `viewport-fit=cover` to the existing viewport meta when absent. It does not change authentication or global code.

The approved compact follow-up removes repeated hero/nav/explanatory blocks; one closed disclosure keeps essential eligibility/privacy/takeover limitations and historical anchors. Thai is the current page language. Proposed SEO/OG title is `Kenji Concierge | MMD Privé`; describe verified member status, Points and safe routing without trilingual/memory promises. These metadata fields are not yet applied: the connector rejects the documented update payload, and no hidden API was used.
