# Kenji UI QA — mocked local preview

Isolated clone based on `31abd3eb891c6970357415f315a528157156004b`; no unrelated checkout or release folder was modified. No repository AGENTS.md or local `.agents/skills` was present. README-FIRST.md and local Codex safety instructions were inspected. Local memory was read only; no memory write.

## Results

- Focused page, integration, existing member-chat and AI member-chat tests: **23 passed**.
- `npm run test:member-dashboard-liff`: **95 passed**.
- `npm run test:member-dashboard-line`: **353 passed**.
- Browser: **58 checks passed**, 8 intercepted mock chat POSTs, no JavaScript runtime errors. All sending was intercepted on loopback; no actual customer messages, records or production requests were sent.
- `git diff --check`: passed.
- Root `npm run check`: passed using installed Node 18.20.8; local npm warns its version does not support Node18. The default Node24.14 runtime stops at a pre-existing removed `--experimental-default-type=module` flag. The root script was not altered.
- `npm run build --if-present`: no build script exists, so no build result is claimed. Scoped source parsing is covered by the tests.

Checks include 320/375/390/430 and 1440px widths, horizontal overflow, 44px targets, 16px input, keyboard Tab/newline, 800-character Thai input, 320×440 keyboard-sized viewport, scroll/sticky status, reduced motion, duplicate submits, busy/empty/local history, failure/malformed JSON/network uncertainty/409, session 401, loading and verified-zero/unknown points, blocked/pending/expired states, query and old hash targets, back/forward and reload. Server takeover reactions are **mock UI tests only**. No streaming API exists in the reused BFF.

## Screenshots

| Width/state | Evidence |
| --- | --- |
| 320px | [Mobile 320](kenji-320.png) |
| 375px | [Mobile 375](kenji-375.png) |
| 390px | [Mobile 390](kenji-390.png) |
| 430px | [Mobile 430](kenji-430.png) |
| 1440px | [Desktop](kenji-1440.png) |
| Inline response | [Chat 390](kenji-chat-390.png) |
| Delivery uncertainty | [Error](kenji-chat-error.png) |
| Mock owner takeover | [Takeover UI](kenji-takeover.png) |
| Login / expired / blocked | [Login](kenji-state-guest.png), [Expired](kenji-state-expired.png), [Blocked](kenji-state-blocked.png) |

![Inline mobile chat](kenji-chat-390.png)

![Desktop concierge](kenji-1440.png)

The portrait is the existing public asset (HTTP200 verified). The loopback preview serves a byte-identical downloaded copy to avoid local browser networking differences; production source retains the verified existing URL and hides the portrait if loading fails. Screenshots were visually inspected at mobile and desktop sizes. CLI Chromium was headless and isolated; no user's existing tabs or physical keyboard were controlled.

## Reproduction

Run `node --experimental-global-webcrypto --test webflow/concierge/kenji/*.test.mjs member-dashboard-chat-worker/test/kenji-member-app.test.mjs ai-worker/test/kenji-member-chat.test.mjs`. Assemble the three wrapped Webflow files in a local HTML shell with a viewport containing `viewport-fit=cover`. Serve on loopback port8765. Use Playwright CLI `run-code --filename webflow/concierge/kenji/qa/browser-qa.js` against an isolated session. The harness mocks the two existing APIs and writes screenshots to `output/playwright/`.

## Remaining acceptance

1. **Takeover authority**: current tracked BFF neither reads a shared owner lock nor carries typed takeover truth. Before claiming Per-away assistance, the existing authoritative conversation guard must gate this BFF ahead of AI invocation and return its actual paused state. No frontend inference or new global-session design was introduced.
2. **General promotions and renewal intake**: current BFF has no approved general-promotion intent and no write intake. The UI asks and provides a coupons link; it does not manufacture offers, eligibility, payment or renewal-received status. Reuse the established authoritative capability in a separately reviewed integration if required.
3. **Published source mismatch**: production serves v5, GitHub tracks v3. Follow the reconciliation plan in the parent README before any paste/publication.
4. Native iOS/Android keyboard, safe-area, actual Webflow/global shell, apex/www authenticated test accounts and live cross-channel owner takeover require controlled acceptance. Responsive Chromium and CSS checks are not native-device proof.
5. Actual-head GitHub CI must be recorded on the draft PR. No merge/publication is authorized.
