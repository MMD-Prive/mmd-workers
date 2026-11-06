import assert from "node:assert/strict";
import test from "node:test";
import { maybeSendModelTelegramBindLink } from "./src/model-telegram-bind-link-push.js";

const subject = { model_record_id: "recNxQLPgFVmRsOcg", line_user_id: "U" + "a".repeat(32), display_name: "Captain S", fields: {} };

function env({ bound = false, kvHit = false, pushOk = true } = {}) {
  const store = new Map(kvHit ? [["model-telegram-bind-link:recNxQLPgFVmRsOcg", "1"]] : []);
  const pushes = [];
  return {
    pushes, store,
    SIGIL_AVAILABILITY_SNAPSHOTS: { get: async (k) => store.get(k) ?? null, put: async (k, v) => store.set(k, v) },
    MEMBER_DASHBOARD_CHAT_WORKER: { fetch: async (req) => { pushes.push(JSON.parse(await req.text())); return new Response(JSON.stringify({ ok: pushOk }), { status: pushOk ? 200 : 502 }); } },
    AIRTABLE_TOKEN: "x",
  };
}

test("invalid subject is skipped", async () => {
  const r = await maybeSendModelTelegramBindLink(env(), { ...subject, line_user_id: "nope" });
  assert.equal(r.sent, false);
});

test("already connected model gets nothing", async () => {
  const e = env();
  const r = await maybeSendModelTelegramBindLink(e, { ...subject, fields: { telegram_verification_status: "verified", telegram_user_id: "123456789" } });
  assert.equal(r.sent, false);
  assert.equal(e.pushes.length, 0);
});

test("cooldown suppresses a second push", async () => {
  const e = env({ kvHit: true });
  const r = await maybeSendModelTelegramBindLink(e, subject);
  assert.deepEqual(r, { sent: false, reason: "cooldown" });
  assert.equal(e.pushes.length, 0);
});

test("never throws when transport/storage missing", async () => {
  const r = await maybeSendModelTelegramBindLink({}, subject);
  assert.equal(r.sent, false);
});
