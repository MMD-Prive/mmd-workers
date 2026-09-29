import assert from "node:assert/strict";
import test from "node:test";

import { buildCareBackTelegramPayload, sendCareBackTelegramPost } from "./send-care-back-telegram-post.mjs";

const PACK = {
  schema: "mmd.care_back_telegram_post.v1",
  campaign_id: "care-back-telegram-20260929",
  destination: { flow: "care_back", worker_url: "https://telegram-worker.example/telegram/internal/send", disable_web_page_preview: false },
  copy: { parse_mode: "HTML", text: "<b>MMD PRIVÉ · CARE BACK</b>\nhttps://www.mmdbkk.com/member/login" },
  safety: { does_not_grant_membership: true, does_not_confirm_payment: true },
};

test("builds safe CARE BACK Telegram payload", () => {
  const payload = buildCareBackTelegramPayload(PACK);
  assert.equal(payload.flow, "care_back");
  assert.equal(payload.parse_mode, "HTML");
  assert.equal(payload.disable_web_page_preview, false);
  assert.match(payload.text, /CARE BACK/);
});

test("rejects missing safety flags and sensitive text", () => {
  assert.throws(() => buildCareBackTelegramPayload({ ...PACK, safety: {} }), /care_back_safety_flags_required/);
  assert.throws(() => buildCareBackTelegramPayload({ ...PACK, copy: { text: "line_user_id U123" } }), /post_text_contains_sensitive_payload/);
});

test("dry-run returns payload without network", async () => {
  const result = await sendCareBackTelegramPost({
    packPath: "ops/campaigns/care-back-telegram-post-20260929.json",
    dryRun: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.payload.flow, "care_back");
});

test("posts to internal Telegram endpoint with service token", async () => {
  let captured = null;
  const result = await sendCareBackTelegramPost({
    packPath: "ops/campaigns/care-back-telegram-post-20260929.json",
    endpoint: "https://telegram-worker.example/telegram/internal/send",
    token: "internal-token",
  }, async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return Response.json({ ok: true, telegram: { ok: true, result: { message_id: 123 } } });
  });
  assert.equal(result.ok, true);
  assert.equal(captured.url, "https://telegram-worker.example/telegram/internal/send");
  assert.equal(captured.init.headers["x-internal-token"], "internal-token");
  assert.equal(captured.body.flow, "care_back");
});
