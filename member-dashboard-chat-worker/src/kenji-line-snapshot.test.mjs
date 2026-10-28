import test from "node:test";
import assert from "node:assert/strict";
import { resolveKenjiLineSnapshotTruth } from "./kenji-line-live-truth.mjs";
import { resolveCheckptsShortcut } from "./rich-menu-conversation.mjs";

const lineUserId = "U" + "a".repeat(32);
const event = { source: { type: "user", userId: lineUserId } };

test("Checkpts uses the bounded snapshot and keeps curated SVIP expiry private", async () => {
  let called = 0;
  const env = { MEMBER_PAGES_WORKER: { fetch: async request => {
    called++;
    assert.equal(new URL(request.url).pathname, "/__internal/kenji/member-reply-snapshot");
    assert.equal((await request.json()).line_user_id, lineUserId);
    return Response.json({ ok: true, authority: "my_mmd_entitlement_resolver_v1", identity_status: "resolved",
      membership: { level: "svip", label: "SVIP", lifecycle: "active", expire_at: "2026-11-30" },
      points: { status: "verified", active_points: 320 } });
  } } };
  const truth = await resolveKenjiLineSnapshotTruth({ env, event });
  const answer = resolveCheckptsShortcut(truth).text;
  assert.equal(called, 1);
  assert.match(answer, /สถานะสมาชิก: SVIP/);
  assert.match(answer, /Points: 320 Points/);
  assert.match(answer, /วันหมดอายุ: 30\/11\/2026/);
});

test("a missing snapshot cannot become an inferred balance", async () => {
  const env = { MEMBER_PAGES_WORKER: { fetch: async () => Response.json({ ok: false }, { status: 503 }) } };
  const truth = await resolveKenjiLineSnapshotTruth({ env, event });
  const answer = resolveCheckptsShortcut(truth).text;
  assert.match(answer, /Points: ยังยืนยันยอดไม่ได้/);
  assert.doesNotMatch(answer, /320/);
});
