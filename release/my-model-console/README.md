# MY MODEL / CONSOLE Full Flow Bundle

Prepared on 2026-11-02 from origin/main
`85fb68fe941972ac5336abcc406a06485943e80a`.
Branch: `feat/my-model-console-full-flow-20261102`.

Per approved this source bundle, commit and feature-branch push. No merge,
deployment, production message, data write, migration, route/secret change or
Webflow publish is approved. Do not run deploy scripts from this package.
No redirect-worker or partner-worker changes are included.

## Included Flow

- D-1 18:00 notice, model acknowledgement, 19:00 unacknowledged owner alert.
- Travel on the job day, ETA, original meeting point, wrong-location reporting,
  two-way session-scoped chat and private photo upload.
- Live payment verification before start_work; finish then separation.
- Customer completion approval/private review, owner completion review/HOLD,
  payout instructions, delivery-unknown manual review and verified payout read.
- Existing Tart Room artwork, font/logo skin and customer working-name display.
  Public/MMD and Private/SIGIL follow authorized backend data, not a skin flag.
- Customer deposit/final-payment status stays separate from model compensation.

Remote-main fixes remain: exact Canonical Model ownership, displayed Session
target on writes, rejection when the current Session changes during reread, and
no-job UI handling without turning outages/auth failures into empty success.

## Local Use

Use Node.js 24 or newer in a normal checkout of the pushed feature branch:

```sh
npm ci --ignore-scripts
node scripts/test-model-console-flow.mjs
MMD_NIGHTLINE_SKIN=1 MMD_CONSOLE_HERO_DESIGN=1 PORT=4219 node preview/model-console/server.mjs
```

Open `http://127.0.0.1:4219/mobile-preview` for the three roles, or
`http://127.0.0.1:4219/payout-preview` for income-evidence cases. Choose another
unused port when needed. The preview binds only to 127.0.0.1.

The ZIP also contains `source-changes.patch`, changed-file inventory, generated
install blocks/assets, test evidence and SHA-256 checksums. The patch applies
only to the exact base SHA above; do not apply it over another dirty checkout.
ZIP source includes unchanged local-import context for the preview and four
Worker entrypoints, not the entire unrelated monorepo or Git history. It is a
handoff overlay, NOT a standalone repository. Admin's existing unrelated imports
include a partner module; that forbidden Worker is deliberately not bundled.
The manifest lists omitted dependencies. To restore without the pushed branch,
start a clean checkout of the exact base SHA and run
`git apply --check /path/to/source-changes.patch` before applying that patch.
Use the complete checkout for running preview, tests and repository/CI tooling.

## Evidence Boundary

Real source handlers are exercised for lifecycle, canonical ownership, signed
customer chat, ETA, aftercare, Payments review/live preflight, owner actions,
HOLD, notification journals/manual review and model-safe payout evidence.

Synthetic only: identities/signing credentials, owner login, profile/media API
responses, Airtable, R2, LINE/Telegram, bank proof/transfer, clock and photo bytes.
The preview exchanges aliases for synthetic signed links. Its owner login
adapter is local-only, not proof of real authentication. Its state is in memory
and resets on process restart. Never install preview adapters in production.
Tests do not establish provider acceptance, real bank transfers, real mobile
camera access, Cloudflare restart/concurrency or production authenticated E2E.

## Release Order And Configuration

After separate approval and fresh live drift/config review:

1. Payments: `payments-worker/wrangler.merged.toml`, entrypoint
   `index.session-paid-projection-wrapper.js`. Not the legacy wrangler.toml.
2. Events: `events-worker/wrangler.toml`, `src/model-eta-wrapper.js`.
3. Admin: `admin-worker/wrangler.toml`, `src/admin-login-hero-worker.js`.
4. Member Pages: `member-pages-worker/wrangler.toml`, `src/runtime-index.js`.
5. UI/assets last: replace existing runtime embeds, never append duplicates.

Events adds private `SESSION_COMPLETION_STATE` R2 -> `mmd-private-model-media`.
Compare all active bindings before applying; do not overwrite dashboard values.
Preserve Admin auth/service bindings, PRIVATE_MODEL_MEDIA, retry schedules and
configured Airtable field mappings. Keep existing payment verification rules,
DoubleMomentCoordinator class/binding/migrations and unrelated runtime behavior.

Nightline font faces are separate blocks, each below the 50,000-byte limit.
Install Console theme/decline before Console runtime; preserve independently
saved footer scripts. Install MY MODEL once and the skin after its runtime.
The combined Nightline font file is not one Webflow Embed. Use its individual
generated blocks. Original `tart-room.png` currently uses local-preview path
`/model-nightline-assets/tart-room.png`; approve a real asset URL before release.

`release/model-session-flow-local/*` and its packet generator retain historical
baseline evidence. They are NOT current production versions or deployment
instructions; their earlier no-push approval state is historical. This bundle's
source manifest and exact commit identify the Git handoff, not the live version.

## Gates Before Live Use

1. Fresh active-source/config/bindings review for each Worker, including active
   Payments DoubleMomentCoordinator and migration parity. Git integration does
   not prove deployed-baseline parity.
2. Compile/inspect each real configured Worker entrypoint, then authenticated
   staging tests with real service auth, field mappings and private storage.
3. Confirm durable conditional-write/locking behavior on actual Cloudflare
   storage, including response loss/restart and HOLD/account changes.
4. Approve asset hosting and saved UI embed inventory; test real mobile camera,
   customer/model/owner identity, wrong Session and payment gates end to end.
5. Separate approval for deploy/upload, Webflow publish and any real messages.

## Rollback

Before an approved release, record each Worker's actual active version/traffic
and save exact UI embeds/assets. Roll back only that release in reverse order:
UI -> Member Pages -> Admin -> Events -> Payments, as applicable. Preserve
receipts, locks, private evidence, payout records and bindings. Code rollback
cannot unsend messages or reverse transfers. Never bulk resend uncertain
Telegram deliveries; keep manual_review and reread state/recipient/account.
