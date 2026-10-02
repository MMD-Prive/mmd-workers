# Global Member Session — 2026-10-03

Owner decision: Per approved a 30-minute active member session and 30-day remembered login.

## Implementation status

Implemented on branch `feat/member-remember-login-30d-20261003`; awaiting CI review and staging validation. Production is unchanged until the PR is approved, merged, and deployed.

The LIFF session cookie remains 30 minutes. After it expires, a separate host-only remembered-device cookie can restore a fresh session for a canonical member for up to 30 days from the original LINE verification.

## Remembered-login contract

- Store an opaque 256-bit device credential in a separate Secure, HttpOnly, host-only cookie. The Durable Object stores only the verified LINE identity reference and expiry, never the raw credential or cached entitlement.
- Create the credential only after backend LINE token verification and canonical member resolution. Never accept a browser-supplied member ID or tier.
- Enforce revocation and expiry through one Durable Object per device credential. Its storage operations serialize, so logout revocation takes effect immediately and expiry is absolute.
- Restore a fresh 30-minute session only after resolving the LINE identity and current member profile again. Do not restore payment, grant, route, or entitlement state from the prior session.
- Passive refresh does not extend the 30-day lifetime. A new verified LINE sign-in after expiry can issue a new device credential.
- Logout removes the current active session, revokes that device credential, and clears both cookies.
- Keep public/private presentation boundaries. Signed payment and media grants retain their independent expiry and authority.
- Host-only cookies work across pages on the canonical `mmdbkk.com` host. Apex/www and LINE webview/external browser cookie stores remain isolated; no token is copied into a URL or browser storage.

## Required acceptance before release

Automated CI must cover issue, expiry, session restoration, canonical member re-resolution, logout/replay rejection, and both cookies. Staging validation must cover real LINE verification; cross-page navigation; day 1/day 29 and day 30 expiry; logout; membership changes; resolver outage; concurrent tabs; apex/www; and iOS/Android LINE versus external browsers. Verify the Worker pages and Webflow pages.

## Verification so far

The PR adds focused tests for restoration after a 30-minute session expires, fixed 30-day expiry, logout revocation, replay rejection, and visible sign-out controls. Full repository CI and real LINE/browser E2E are pending.
