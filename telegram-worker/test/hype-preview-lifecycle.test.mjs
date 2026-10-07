import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, it } from "node:test";

import worker from "../src/index.js";
import { handleHypePreviewApi, handleTelegramWebhook } from "../lib/hype-preview.js";

const CAMPAIGN = "preview_pride_jun2026";
const MIGRATIONS = [
  new URL("../migrations/0001_hype_preview_intake.sql", import.meta.url),
  new URL("../migrations/0002_hype_preview_public_headline.sql", import.meta.url),
];

// Minimal D1 facade over node:sqlite so the real migration and SQL run unchanged.
function d1(db) {
  const norm = (args) => args.map((v) => (v === undefined ? null : v));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const bound = (args) => ({
        first: async () => stmt.get(...norm(args)) ?? null,
        all: async () => ({ results: stmt.all(...norm(args)) }),
        run: async () => {
          const info = stmt.run(...norm(args));
          return { success: true, meta: { changes: Number(info.changes) } };
        },
      });
      return { bind: (...args) => bound(args), ...bound([]) };
    },
  };
}

function isoFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

let db;
let sent;
let realFetch;

function makeEnv(overrides = {}) {
  return {
    HYPE_DB: d1(db),
    HYPE_CODE_HMAC_SECRET: "hmac-secret",
    HYPE_CODE_ENCRYPTION_SECRET: "enc-secret",
    TELEGRAM_BOT_TOKEN: "bot-token",
    HYPE_PREVIEW_CAMPAIGN: CAMPAIGN,
    HYPE_PREVIEW_CODE_TTL_DAYS: "30",
    INTERNAL_API_TOKEN: "internal-secret",
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "webhook-secret",
    ...overrides,
  };
}

function setCampaignWindow({ startsAt = isoFromNow(-10), endsAt = isoFromNow(10), deadline = endsAt, status = "active" } = {}) {
  db.prepare(
    `UPDATE hype_campaigns SET issue_starts_at = ?, issue_ends_at = ?, signup_deadline = ?, status = ? WHERE campaign_id = ?`,
  ).run(startsAt, endsAt, deadline, status, CAMPAIGN);
}

function startUpdate(userId) {
  return { message: { text: "/start preview", chat: { id: userId }, from: { id: userId, first_name: "T" } } };
}

async function issueCode(env, userId = 1001) {
  const out = await handleTelegramWebhook(startUpdate(userId), env);
  assert.equal(out.action, "code_issued");
  const msg = sent.map((m) => m.text).find((t) => /<code>\d{6}<\/code>/.test(t || ""));
  const code = /<code>(\d{6})<\/code>/.exec(msg)[1];
  sent = [];
  return { code, codeId: out.code_id };
}

function row(codeId) {
  return db.prepare(`SELECT * FROM hype_preview_codes WHERE id = ?`).get(codeId);
}

async function api(path, body, env) {
  return handleHypePreviewApi(`/api/hype/preview/${path}`, body, env);
}

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of MIGRATIONS) db.exec(readFileSync(file, "utf8"));
  setCampaignWindow();
  sent = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  db.close();
});

describe("redeem is one-time-use and idempotent", () => {
  it("replays an identical retry without changing the row", async () => {
    const env = makeEnv();
    const { code, codeId } = await issueCode(env);
    const body = { promo: code, selected_package: "standard", memberstack_id: "mem_1" };

    const first = await api("redeem", body, env);
    assert.equal(first.body.redeemed, true);
    const before = row(codeId);

    const retry = await api("redeem", body, env);
    assert.equal(retry.body.redeemed, true);
    assert.equal(retry.body.idempotent_replay, true);
    assert.equal(retry.body.pending_bonus_points, 150);
    assert.deepEqual(row(codeId), before);
  });

  it("rejects a second redeem by another account or with another package", async () => {
    const env = makeEnv();
    const { code, codeId } = await issueCode(env);
    await api("redeem", { promo: code, selected_package: "standard", memberstack_id: "mem_1" }, env);

    const otherAccount = await api("redeem", { promo: code, selected_package: "standard", memberstack_id: "mem_2" }, env);
    assert.equal(otherAccount.body.redeemed, false);
    assert.equal(otherAccount.body.reason, "already_redeemed");

    const upgrade = await api("redeem", { promo: code, selected_package: "premium", memberstack_id: "mem_1" }, env);
    assert.equal(upgrade.body.redeemed, false);
    assert.equal(upgrade.body.reason, "already_redeemed");

    const anonymous = await api("redeem", { promo: code, selected_package: "standard" }, env);
    assert.equal(anonymous.body.redeemed, false);

    const stored = row(codeId);
    assert.equal(stored.selected_package, "standard");
    assert.equal(stored.pending_bonus_points, 150);
    assert.equal(stored.memberstack_id, "mem_1");
  });

  it("rejects redeem once the code is pending verification", async () => {
    const env = makeEnv();
    const { code } = await issueCode(env);
    const first = await api("redeem", { promo: code, selected_package: "premium", memberstack_id: "mem_1", payment_ref: "pay_1" }, env);
    assert.equal(first.body.status, "pending_verification");

    const again = await api("redeem", { promo: code, selected_package: "standard", client_record_id: "rec_9" }, env);
    assert.equal(again.body.redeemed, false);
    assert.equal(again.body.reason, "already_redeemed");
  });

  it("rejects redeem when the account already claimed another code", async () => {
    const env = makeEnv();
    const a = await issueCode(env, 1001);
    const b = await issueCode(env, 1002);
    await api("redeem", { promo: a.code, selected_package: "standard", memberstack_id: "mem_1" }, env);

    const second = await api("redeem", { promo: b.code, selected_package: "premium", memberstack_id: "mem_1" }, env);
    assert.equal(second.body.redeemed, false);
    assert.equal(second.body.reason, "account_already_claimed");
    assert.equal(row(b.codeId).status, "issued");
  });
});

describe("credit is the final points gate", () => {
  const verified = { payment_verified: true, new_member_verified: true };

  it("rejects an expired code even if no earlier call marked it expired", async () => {
    const env = makeEnv();
    const { code, codeId } = await issueCode(env);
    await api("redeem", { promo: code, selected_package: "standard", memberstack_id: "mem_1" }, env);
    db.prepare(`UPDATE hype_preview_codes SET expires_at = ? WHERE id = ?`).run(isoFromNow(-1), codeId);

    const out = await api("credit", { promo: code, ...verified }, env);
    assert.equal(out.body.credited, false);
    assert.equal(out.body.reason, "expired");
    assert.equal(row(codeId).status, "expired");
    assert.equal(row(codeId).credited_points, null);
  });

  it("credits once per member account across codes", async () => {
    const env = makeEnv();
    const a = await issueCode(env, 1001);
    const b = await issueCode(env, 1002);

    const first = await api("credit", { promo: a.code, selected_package: "standard", memberstack_id: "mem_1", ...verified }, env);
    assert.equal(first.body.credited, true);
    assert.equal(first.body.credited_points, 150);

    const second = await api("credit", { promo: b.code, selected_package: "premium", memberstack_id: "mem_1", ...verified }, env);
    assert.equal(second.body.credited, false);
    assert.equal(second.body.reason, "account_already_claimed");
    assert.equal(row(b.codeId).status, "issued");

    const byClientRecord = await api("credit", { promo: b.code, selected_package: "premium", client_record_id: "rec_1", ...verified }, env);
    assert.equal(byClientRecord.body.credited, true, "a different account can still use its own code");
  });

  it("requires a member identity so the per-account guard can run", async () => {
    const env = makeEnv();
    const { code } = await issueCode(env);
    const out = await api("credit", { promo: code, selected_package: "standard", ...verified }, env);
    assert.equal(out.status, 400);
    assert.equal(out.body.error, "member_identity_required");
  });

  it("does not credit twice", async () => {
    const env = makeEnv();
    const { code } = await issueCode(env);
    const body = { promo: code, selected_package: "standard", memberstack_id: "mem_1", ...verified };
    assert.equal((await api("credit", body, env)).body.credited, true);
    const again = await api("credit", body, env);
    assert.equal(again.body.credited, false);
    assert.equal(again.body.reason, "already_credited");
  });
});

describe("validate", () => {
  it("returns the computed package and points for a fresh code", async () => {
    const env = makeEnv();
    const { code } = await issueCode(env);
    const out = await api("validate", { promo: code, selected_package: "premium" }, env);
    assert.equal(out.body.valid, true);
    assert.equal(out.body.selected_package, "premium");
    assert.equal(out.body.pending_bonus_points, 250);
    assert.equal(out.body.status, "issued");
  });

  it("rejects unknown packages", async () => {
    const env = makeEnv();
    const { code } = await issueCode(env);
    const out = await api("validate", { promo: code, selected_package: "gold" }, env);
    assert.equal(out.body.valid, false);
    assert.equal(out.body.reason, "package_not_eligible");
  });
});

describe("campaign window", () => {
  it("caps code expiry at the campaign signup deadline", async () => {
    const deadline = isoFromNow(3);
    setCampaignWindow({ endsAt: deadline, deadline });
    const env = makeEnv();
    const { codeId } = await issueCode(env);
    assert.equal(row(codeId).expires_at, new Date(deadline).toISOString());
  });

  it("keeps the rolling TTL when the deadline is further out", async () => {
    setCampaignWindow({ endsAt: isoFromNow(90), deadline: isoFromNow(90) });
    const env = makeEnv({ HYPE_PREVIEW_CODE_TTL_DAYS: "30" });
    const { codeId } = await issueCode(env);
    const days = (Date.parse(row(codeId).expires_at) - Date.now()) / 86400000;
    assert.ok(days > 29 && days <= 30, `expected ~30 days, got ${days}`);
  });

  it("uses an explicit signup deadline env var when set", async () => {
    const env = makeEnv({ HYPE_PREVIEW_SIGNUP_DEADLINE: "2026-12-31T23:59:59+07:00" });
    const { codeId } = await issueCode(env);
    assert.equal(row(codeId).expires_at, "2026-12-31T23:59:59+07:00");
  });

  it("stops issuing new codes after the campaign ends", async () => {
    setCampaignWindow({ startsAt: isoFromNow(-40), endsAt: isoFromNow(-1) });
    const env = makeEnv();
    const out = await handleTelegramWebhook(startUpdate(2001), env);
    assert.equal(out.action, "campaign_closed");
    assert.equal(out.reason, "campaign_ended");
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM hype_preview_codes`).get().n, 0);
    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0].text, /<code>/);
  });

  it("does not issue before the campaign starts or when it is paused", async () => {
    setCampaignWindow({ startsAt: isoFromNow(1), endsAt: isoFromNow(10) });
    assert.equal((await handleTelegramWebhook(startUpdate(2002), makeEnv())).reason, "campaign_not_started");
    setCampaignWindow({ status: "paused" });
    assert.equal((await handleTelegramWebhook(startUpdate(2003), makeEnv())).reason, "campaign_paused");
  });

  it("still re-sends an existing code after the campaign ends", async () => {
    const env = makeEnv();
    const { code } = await issueCode(env, 3001);
    setCampaignWindow({ startsAt: isoFromNow(-40), endsAt: isoFromNow(-1) });
    const out = await handleTelegramWebhook(startUpdate(3001), env);
    assert.equal(out.action, "code_reissued_to_same_user");
    assert.match(sent[0].text, new RegExp(code));
  });
});

describe("seeded campaign copy", () => {
  it("does not advertise a public 350-point headline", () => {
    const { public_offer_headline_th: headline } = db
      .prepare(`SELECT public_offer_headline_th FROM hype_campaigns WHERE campaign_id = ?`)
      .get(CAMPAIGN);
    assert.doesNotMatch(headline, /350/);
    assert.match(headline, /Standard ได้ 150/);
    assert.match(headline, /Premium ได้ 250/);
  });

  it("0002 rewrites a previously seeded 350-point headline", () => {
    db.prepare(`UPDATE hype_campaigns SET public_offer_headline_th = ? WHERE campaign_id = ?`)
      .run("รับรหัส 6 หลักผ่าน Telegram Preview เพื่อใช้รับ POINTS พิเศษ สูงสุดถึง 350 POINTS", CAMPAIGN);
    db.exec(readFileSync(MIGRATIONS[1], "utf8"));
    const { public_offer_headline_th: headline } = db
      .prepare(`SELECT public_offer_headline_th FROM hype_campaigns WHERE campaign_id = ?`)
      .get(CAMPAIGN);
    assert.doesNotMatch(headline, /350/);
  });
});

describe("telegram webhook authentication", () => {
  function webhook(headers = {}) {
    return new Request("https://telegram-worker.mmd.test/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(startUpdate(4001)),
    });
  }

  it("rejects updates without the secret header before issuing codes", async () => {
    const res = await worker.fetch(webhook(), makeEnv());
    assert.equal(res.status, 401);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM hype_preview_codes`).get().n, 0);
  });

  it("rejects a wrong secret", async () => {
    const res = await worker.fetch(webhook({ "X-Telegram-Bot-Api-Secret-Token": "nope" }), makeEnv());
    assert.equal(res.status, 401);
  });

  it("fails closed when no secret is configured", async () => {
    const res = await worker.fetch(webhook({ "X-Telegram-Bot-Api-Secret-Token": "anything" }), makeEnv({ TELEGRAM_WEBHOOK_SECRET_TOKEN: "" }));
    assert.equal(res.status, 503);
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM hype_preview_codes`).get().n, 0);
  });

  it("issues a code for an authenticated update", async () => {
    const res = await worker.fetch(webhook({ "X-Telegram-Bot-Api-Secret-Token": "webhook-secret" }), makeEnv());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.hype.action, "code_issued");
  });
});
