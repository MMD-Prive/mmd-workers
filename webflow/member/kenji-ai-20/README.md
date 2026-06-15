# Kenji Member Concierge

Member-facing Webflow asset for `/member/kenji-ai-20`.

Canonical route meaning:

- `/member/dashboard` is Member Home / Status Hub.
- `/member/kenji-ai-20` is Kenji AI / member-facing concierge.
- `/sigil/board` remains the internal system, admin, rules, and control layer.

## Usage

Load `kenji-member-concierge.js` on the member-facing page and add optional bindings:

```html
<section data-kenji-concierge>
  <div data-kenji-status></div>
  <input data-kenji-input />
  <button data-kenji-send>Ask Kenji</button>
  <div data-kenji-intent></div>
  <div data-kenji-reply></div>
</section>
```

The browser global is `window.MMDKenjiMemberConcierge`.

Available helpers:

- `classifyIntent(input, memberSummary)`
- `buildKenjiReply(input, memberSummary)`
- `sanitizeMemberSummary(input)`
- `loadSanitizedMemberSummary(options)`

## Data Safety

The frontend reads only sanitized member summary data. It uses query param `t` only and does not send or expose frontend secrets.

If the backend member summary endpoint is unavailable, the asset falls back to `DEMO_ONLY_MEMBER_SUMMARY`, which is explicitly named demo-only and contains no real member data.

Payment slips are supporting evidence only. Confirmation happens only after official verification and fund matching.

SVIP is Boss Per manual-only, never points-based.

Black Card is private review, not automatic approval.
