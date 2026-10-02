# MMD on the Sound: isolated fixture staging preparation

Prepared for existing OA @203pwydh, channel 2011839389, provider MMD 2004492377. Owner enabled Messaging API; read-only UI verification confirms the identifiers. Webhook URL remains empty. No credentials have been read, generated, transmitted or stored by this work.

## Isolation contract

`member-dashboard-chat-worker/wrangler.line-rights-fixture.toml` is a separate top-level config, not an environment inheriting production config. Dedicated proposed Worker `mmd-sound-rights-fixture-staging`, SQLite Durable Object class `LineRightsFixtureState`. No routes, workers.dev exposure, production services, Airtable, KV, R2, payments, AI or Telegram bindings. No production truth writes. No scheduled triggers.

The dedicated entry reuses the production rights-check handler, renderer and durable claim algorithm, injecting only static synthetic membership/points/quote scenarios and synthetic operator-review storage. It verifies the LINE signature and exact test-bot destination UID, then allows exactly one reviewed owner SHA-256 UID. Off mode, blank allowlist/destination and emergency stop=true are committed defaults. Newly initialized durable controls also stop all replies and activate owner takeover until explicitly armed. Missing control/storage fails closed. Fresh control and takeover checks occur before delivery. The delivery transport is reply-only; no push/broadcast/campaign endpoint exists here. Every permitted response starts `[STAGING — ข้อมูลจำลอง ไม่ใช่สิทธิ์จริง]`.

Fixture state stores scenario, kill/takeover flags, synthetic review reason and delivered count. Claims use hashes. No raw UID, message text, reply token or customer ledger is persisted. It provides POST `/fixture/control` and `/fixture/receipt`, protected by a separate operator secret. POST `/webhooks/line` accepts only signed test-OA messages. All routes return no-store. No generic admin/public customer-read APIs.

This harness proves only fixture handler/control/delivery behavior. It intentionally bypasses canonical intake and production member-pages/Airtable lookup. It does not prove production data field coverage, real entitlement amounts, renewal correctness for a real member, full intake parity, main OA routing, mobile session behavior or latency. Synthetic review receipts are NOT genuine Per/payment approval cases.

## Next exact approval and owner handoff

1. Owner securely supplies existing test-OA `LINE_CHANNEL_SECRET`, an approved test-OA `LINE_CHANNEL_ACCESS_TOKEN`, and an independent `LINE_FIXTURE_OPERATOR_TOKEN` into Cloudflare secrets for this proposed Worker only. Do not paste values in chat, logs, Git or evidence. Token issuance, if needed, is a separate owner action; this preparation creates none.
2. Owner verifies the test bot destination UID and their own MMD-provider UID. Configure the bot UID as `LINE_FIXTURE_DESTINATION_ID` and only SHA-256(owner UID) in `KENJI_LINE_RIGHTS_CHECK_PILOT_HASHES`. Neither numeric channel ID nor display name is a provider UID. No inferred friend identity.
3. Approve creation/deployment of exactly the dedicated Worker and its new SQLite DO namespace/migration above, with no other resources or data bindings. Decide approved protected operator-access mechanism before exposure. Keep reply mode off and emergency stop on during the initial deployment. No public hostname exists yet; obtain it from the actual deployment receipt.
4. Only after the deployed config/receipt is verified, separately approve workers.dev exposure, webhook URL assignment and verification for @203pwydh only. Never change the main OA webhook. Decide native test-OA response duplication settings explicitly; no existing Chat/greeting/response-hour settings are changed here.
5. Separately approve the owner-device fixture test: set pilot mode with the single reviewed hash and destination, select a fixture scenario through operator control, clear only the dedicated staging stop, and send the owner's own exact messages. Main OA kills remain unchanged. Reassert fixture stop immediately after the test; mode off is the release default.

## Acceptance

An operator arm expires after15minutes. The isolated durable state reserves at most10LINE reply attempts total, including ambiguous transport failures; rearming or changing scenarios does not reset that cap. Expiry/cap/owner-takeover/emergency stop each suppress replies. These bounds do not disconnect the webhook or stop all inbound request billing: the agreed teardown remains required after the test.

Owner sends เช็กสิทธิ์/ต่ออายุ: active, expired, new signup, unknown and protected VIP/SVIP/Blackcard scenarios. Check the test label, honest pending handling and synthetic review receipt. Confirm nonowner/group/unrelated/slip text never replies; invalid signature/destination and old/redelivered events fail closed; repeated event/ambiguous timeout do not retry; owner takeover and emergency stop win before delivery. There is no transfer, slip verification, approval, real membership grant or points mutation in this sandbox.

Before any production pilot, finish the separate main integration review and main CI, real own-member field coverage read-only qualification, signed canonical intake acceptance, owner queue usability, and explicit production release approval. This draft does not authorize merge or deployment.
