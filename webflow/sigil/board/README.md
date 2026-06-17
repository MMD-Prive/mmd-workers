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
Load it after the V7.0 board embed. It adds a delegated click handler for gate
unlock controls and exposes `window.mmdBoardV70UnlockGate()` as a console
fallback. The fallback prompts for the passphrase when called without arguments,
or can be called as `window.mmdBoardV70UnlockGate("sigil")`.

The mock passphrase is `sigil`. On unlock it only writes these local browser
flags:

```js
localStorage.setItem("mmd_board_v70_gate", "unlocked");
localStorage.setItem("mmd_board_v70_role", "boss_per");
```

This helper does not include secrets and does not send production writes from
Webflow.

### Webflow Placement For `/sigil/board`

1. Add the HTML/root embed first on the `/sigil/board` Webflow page.
2. Add the main V7 board inline JS after the HTML/root embed.
3. Load `kenji-board-v70-gate.js` after the V7 board/root markup and board
   inline JS.
4. Load `kenji-board-v70-smoke-test.js` last, or in Webflow **Before
   `</body>`**.
5. The HTML/root embed must include the V7 root and gate elements shown in
   `kenji-board-v70-webflow-snippet.html`:
   - `[data-mmd-board-v70]`
   - `[data-v70-gate-passphrase]`
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

<!-- 3. Gate helper after the V7 board/root markup -->
<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@main/webflow/sigil/board/kenji-board-v70-gate.js"></script>

<!-- 4. Smoke helper last, or in Webflow Before </body> -->
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
  passphraseInput: true,
  unlockButton: true,
  status: true,
  helperLoaded: true,
  gate: "unlocked",
  role: "boss_per"
}
```

4. You can also confirm the browser localStorage values directly:

```js
localStorage.getItem("mmd_board_v70_gate") === "unlocked";
localStorage.getItem("mmd_board_v70_role") === "boss_per";
```

If the gate is still locked, the smoke helper attempts
`window.mmdBoardV70UnlockGate("sigil")` client-side only.

This is a Webflow UI gate only. It must not perform backend writes, Worker
route changes, Airtable writes, payment changes, membership changes, token
handling changes, SVIP changes, or Black Card behavior changes.
