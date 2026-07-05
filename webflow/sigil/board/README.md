# Kenji Board V7.0 Webflow Integration

`/sigil/board` is the Webflow surface for the SIGIL Board / Kenji Board control view.
The page should stay Webflow-safe: it can unlock the local UI gate, read the safe
runtime snapshot, and run smoke checks, but it must not write production state.

## Legacy V5 copy override

`kenji-board-v5-copy-override.js` is a copy-only helper for the older live
`/sigil/board` embed that contains `mmd-board-v5`.

Load it only after the existing Board V5 HTML/JS. It updates visible copy,
button labels, and local output guidance scoped to `[data-mmd-board-v5]`.

It does not change routes, Worker endpoint contracts, token handling, payment
logic, membership logic, SVIP logic, Black Card logic, or backend API behavior.
It also does not include Airtable tokens, Worker secrets, admin keys, or private
API keys.

## V7.0 helpers

`kenji-board-v70-gate.js` is a Webflow-safe gate helper for the V7.0 board.
Load `webflow/mmd-gate.js` first, then load this helper after the V7.0 board
embed. It adds a delegated click handler for gate unlock controls and exposes
`window.mmdBoardV70UnlockGate()` as a console fallback.

`kenji-board-v70-runtime.js` connects the unlocked board to the read-only
SIGIL Board Worker runtime with `GET /sigil/board/runtime`. It renders safe
runtime metadata, locked truths, and rules into the Webflow placeholders. It
exposes `window.mmdBoardV70LoadRuntime()` and `window.mmdBoardV70RuntimeUrl()`
as console helpers.

Protected Webflow pages must set
`window.MMD_AUTH_WORKER_BASE_URL = "https://mmdbkk.com"` before loading
`webflow/mmd-gate.js`. This is required on `mmdprive.webflow.io` so auth checks
call the canonical `mmdbkk.com` auth route.

The runtime helper should set
`window.MMD_SIGIL_BOARD_WORKER_BASE_URL = "https://sigil.mmdbkk.com"` before
loading `kenji-board-v70-runtime.js`, unless a page-level override points to a
new canonical Worker route.

The gate checks the native MMD auth-worker session with `GET /v1/auth/me` and
`credentials: "include"`. It must not compute access from Memberstack
`customFields`, localStorage, DOM attributes, or browser-only passphrases.

The V7 helpers do not include secrets and do not send production writes from
Webflow.

## Webflow Placement For `/sigil/board`

1. Add the HTML/root embed first on the `/sigil/board` Webflow page.
2. Set `window.MMD_AUTH_WORKER_BASE_URL = "https://mmdbkk.com"` before
   `webflow/mmd-gate.js`.
3. Set `window.MMD_SIGIL_BOARD_WORKER_BASE_URL = "https://sigil.mmdbkk.com"`
   before `kenji-board-v70-runtime.js`.
4. Load `webflow/mmd-gate.js` before any protected page/gate script.
5. Load `kenji-board-v70-gate.js` after the V7 board/root markup.
6. Load `kenji-board-v70-runtime.js` after the V7 gate helper.
7. Load `kenji-board-v70-smoke-test.js` last, or in Webflow **Before
   `</body>`**.
8. The HTML/root embed must include the V7 root, gate, and runtime elements
   shown in `kenji-board-v70-webflow-snippet.html`:
   - `[data-mmd-board-v70]`
   - `[data-v70-auth-check]`
   - `[data-v70-action="unlock-gate"]`
   - `[data-v70-gate-status]`
   - `[data-v70-runtime-status]`
   - `[data-v70-runtime-meta]`
   - `[data-v70-runtime-rules]`

Recommended Webflow order:

```html
<!-- 1. HTML/root embed first -->
<!-- Paste the contents of kenji-board-v70-webflow-snippet.html, excluding this comment. -->

<!-- 2. Set canonical Worker bases before helpers -->
<script>
  window.MMD_AUTH_WORKER_BASE_URL = "https://mmdbkk.com";
  window.MMD_SIGIL_BOARD_WORKER_BASE_URL = "https://sigil.mmdbkk.com";
</script>

<!-- 3. Auth-worker gate helper before protected scripts -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/mmd-gate.js"></script>

<!-- 4. Gate helper after the V7 board/root markup -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/sigil/board/kenji-board-v70-gate.js"></script>

<!-- 5. Runtime helper after the gate helper -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/sigil/board/kenji-board-v70-runtime.js"></script>

<!-- 6. Smoke helper last, or in Webflow Before </body> -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/sigil/board/kenji-board-v70-smoke-test.js"></script>
```

## Smoke Test

1. Open `/sigil/board`.
2. Confirm the helpers are loaded:

```js
typeof window.mmdBoardV70UnlockGate === "function";
typeof window.mmdBoardV70LoadRuntime === "function";
typeof window.mmdBoardV70RuntimeUrl === "function";
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
  runtimeStatus: true,
  runtimeMeta: true,
  runtimeRules: true,
  helperLoaded: true,
  runtimeHelperLoaded: true,
  authHelperLoaded: true,
  gate: "unlocked",
  role: "member"
}
```

If the gate is still locked, the smoke helper attempts
`window.mmdBoardV70UnlockGate({ redirect: false })`. A locked result usually
means the browser has no valid auth-worker session cookie yet.

To check the runtime connection directly after the gate unlocks:

```js
window.mmdBoardV70RuntimeUrl();
window.mmdBoardV70LoadRuntime({ force: true });
```

This is a Webflow UI gate and read-only runtime bridge only. Airtable
entitlements and `member_packages` remain the access truth through auth-worker.
The helpers must not perform backend writes, Worker route changes, Airtable
writes, payment changes, membership changes, token handling changes, SVIP
changes, or Black Card behavior changes.
