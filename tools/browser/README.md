# Scoped local browser regressions

Uses the actual configured Admin/Payments runtime and synthetic Airtable rows.
No production credentials. All browser requests outside loopback are blocked.
The local bridge obtains the real synthetic owner session through the login
handler; it only adapts the cookie Domain for the loopback transport.

From source/admin-worker/test/runtime, install runtime dependencies:

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

Then from this tools/browser directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:outage
npm run test:races
```

`npm test` runs both. Google Chrome must be installed; it is launched with a
separate temporary browser profile. No browser download is performed. To use
another installed Playwright channel, set MMD_BROWSER_CHANNEL. Node 24 and
Playwright 1.62.1 match the prior validation environment. Dependency packages
must be downloaded with network approval; tests themselves use loopback only.

The runner starts an ephemeral loopback server, waits for runtime readiness,
runs the selected cases and stops the server on normal completion/failure.
Generated metadata and screenshots stay under this directory; do not commit
those generated files or node_modules. Test fixture controls are loopback-only
tools, not deployed Worker routes.

Outage: verified DOM -> total Airtable 503 -> polling hides amounts -> eight
unavailable requests -> restore -> eight equal balances with unchanged ledgers.
Races: actual 12-second client timeout, delayed real old-Session response after
switching, missing owner cookie (401), and real synthetic relogin recovery.

Prior browser evidence remains in ../../evidence. After relocation, npm ci was
run for both locked dependency sets and npm test passed outage and races from
this directory (2026-11-03). No harness/runtime correction was needed. See
../../evidence/portable-browser-rerun for results and screenshots.
Missing-cookie proof is not time-based token-expiry proof. External Airtable,
LINE, Telegram and bank acceptance remain separate production gates.
