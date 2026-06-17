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
