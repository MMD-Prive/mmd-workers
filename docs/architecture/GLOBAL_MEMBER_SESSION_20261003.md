# Global Member Session — 2026-10-03

Owner decision: Per approved a 30-minute active member session and 30-day remembered login.

## Implementation status

Draft, not deployed. This change sets the LIFF session lifetime and stable-session rotation cap to 1,800 seconds. The 30-day remembered-login mechanism is NOT implemented by this patch. Do not merge this draft as the completed feature.

## Remembered-login contract

- Use a separate opaque Secure, HttpOnly, host-only cookie and server-side revocable device credential. Never lengthen the active session cookie to 30 days.
- Establish remembered credentials only after backend verification of LINE identity. Never accept a browser-supplied member ID or tier.
- Absolute remembered lifetime is 30 days from verification, not extended by passive refresh.
- Refresh issues a new 30-minute session and re-resolves current canonical identity/entitlement. Do not restore stale payment, grant, routing, or profile state from an old session snapshot.
- Logout revokes the remembered device and its associated active sessions, and clears both cookies. Credential revocation and rotation require consistent server-side enforcement.
- Resolve the existing KV non-atomic rotation constraint before enabling remembered credentials; define multi-tab concurrency and replay handling.
- Keep existing public/private presentation boundaries. Remaining signed payment/media grants keep their independent expiry and authority.
- Host-only cookies do not bridge apex/www or LINE webview/external browser cookie stores. Select and test canonical navigation; never copy tokens into URLs or browser storage.

## Required acceptance before release

Real LINE verification; cross-page navigation; refresh after 30-minute expiry; return on day 1 and day 29; rejection after day 30; logout followed by replay; revoked device; concurrent tabs; resolver outage; membership change; apex/www and iOS/Android LINE versus external browsers. Verify Worker-owned pages as well as Webflow.

## Verification so far

Syntax checks passed for both modified JavaScript files. No authenticated E2E or full repository suite has run. Repository cloning was unavailable; changes were made through the connected GitHub API.
