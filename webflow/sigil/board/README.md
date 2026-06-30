# Kenji Board V5 Webflow Copy Override

`kenji-board-v5-copy-override.js` is a copy-only Webflow helper for the live
`/sigil/board` embed that contains `mmd-board-v5`.

Load it after the existing Board V5 HTML/JS. It only updates visible copy,
button labels, and local output guidance scoped to `[data-mmd-board-v5]`.

It does not change routes, Worker endpoint contracts, token handling, payment
logic, membership logic, SVIP logic, Black Card logic, or backend API behavior.
It also does not include Airtable tokens, Worker secrets, admin keys, or private
API keys.

## Kenji Board V7.0 Gate Helper

`kenji-board-v70-gate.js` is a Webflow-safe gate helper for the V7.0 board.
Load `webflow/mmd-gate.js` first, then load this helper after the V7.0 board
embed. It adds a delegated click handler for gate unlock controls and exposes
`window.mmdBoardV70UnlockGate()` as a console fallback.

Protected Webflow pages must set
`window.MMD_AUTH_WORKER_BASE_URL = "https://mmdbkk.com"` before loading
`webflow/mmd-gate.js`. This is required on `mmdprive.webflow.io` so auth checks
call the canonical `mmdbkk.com` auth route.

The gate checks the native MMD auth-worker session with `GET /v1/auth/me` and
`credentials: "include"`. It must not compute access from Memberstack
`customFields`, localStorage, DOM attributes, or browser-only passphrases.

This helper does not include secrets and does not send production writes from
Webflow.

### Webflow Placement For `/sigil/board`

1. Add the HTML/root embed first on the `/sigil/board` Webflow page.
2. Add the main V7 board inline JS after the HTML/root embed.
3. Set `window.MMD_AUTH_WORKER_BASE_URL = "https://mmdbkk.com"` before
   `webflow/mmd-gate.js`.
4. Load `webflow/mmd-gate.js` before any protected page/gate script.
5. Load `kenji-board-v70-gate.js` after the V7 board/root markup and board
   inline JS.
6. Load `kenji-board-v70-smoke-test.js` last, or in Webflow **Before
   `</body>`**.
7. The HTML/root embed must include the V7 root and gate elements shown in
   `kenji-board-v70-webflow-snippet.html`:
   - `[data-mmd-board-v70]`
   - `[data-v70-auth-check]`
   - `[data-v70-action="unlock-gate"]`
   - `[data-v70-gate-status]`

Recommended Webflow order:

```html
<!-- 1. HTML/root embed first -->
<!-- Paste the contents of kenji-board-v70-webflow-snippet.html, excluding this comment. -->

<!-- 2. Main V7 board inline JS after the HTML/root embed -->
<script>
  /* Paste the main Kenji Board V7.0 inline JS here. */
</script>

<!-- 3. Set the canonical auth-worker base before the shared gate helper -->
<script>
  window.MMD_AUTH_WORKER_BASE_URL = "https://mmdbkk.com";
</script>

<!-- 4. Auth-worker gate helper before protected scripts -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/mmd-gate.js"></script>

<!-- 5. Gate helper after the V7 board/root markup -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/sigil/board/kenji-board-v70-gate.js"></script>

<!-- 6. Smoke helper last, or in Webflow Before </body> -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/sigil/board/kenji-board-v70-smoke-test.js"></script>
```

### Smoke Test

1. Open `/sigil/board`.
2. Confirm the gate helper is loaded:

```js
typeof window.mmdBoardV70UnlockGate === "function";
```

3. Run the smoke helper from the console:

```js
window.mmdBoardV70SmokeTest();
```

Expected result after the helper unlocks the local Webflow gate:

```js
{
  ok: true,
  root: true,
  authCheck: true,
  unlockButton: true,
  status: true,
  helperLoaded: true,
  authHelperLoaded: true,
  gate: "unlocked",
  role: "member"
}
```

If the gate is still locked, the smoke helper attempts
`window.mmdBoardV70UnlockGate({ redirect: false })`. A locked result usually
means the browser has no valid auth-worker session cookie yet.

This is a Webflow UI gate only. Airtable entitlements and `member_packages`
remain the access truth through auth-worker. The helper must not perform backend
writes, Worker route changes, Airtable writes, payment changes, membership
changes, token handling changes, SVIP changes, or Black Card behavior changes.
