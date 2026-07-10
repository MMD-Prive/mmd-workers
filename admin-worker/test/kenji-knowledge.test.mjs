import assert from "node:assert/strict";
import test from "node:test";
import { handleKenjiKnowledgeRequest } from "../src/kenji-knowledge.js";

const ADMIN_TOKEN = "admin-test-token";
const INTERNAL_TOKEN = "internal-test-token";
const BASE = "https://admin-worker.test";

class FakeKV {
  constructor() {
    this.map = new Map();
  }

  async get(key, type) {
    const value = this.map.get(key) || null;
    if (type === "json" && value) return JSON.parse(value);
    return value;
  }

  async put(key, value) {
    this.map.set(key, value);
  }

  async list(options = {}) {
    const prefix = options.prefix || "";
    const limit = options.limit || 1000;
    const start = Number(options.cursor || 0);
    const keys = [...this.map.keys()].filter((key) => key.startsWith(prefix)).sort();
    const page = keys.slice(start, start + limit).map((name) => ({ name }));
    const next = start + page.length;
    return {
      keys: page,
      list_complete: next >= keys.length,
      cursor: next >= keys.length ? undefined : String(next),
    };
  }
}

function env() {
  return {
    ADMIN_BEARER: ADMIN_TOKEN,
    CONFIRM_KEY: "confirm-test-token",
    INTERNAL_TOKEN,
    KENJI_KNOWLEDGE_KV: new FakeKV(),
  };
}

function adminHeaders(extra = {}) {
  return { Authorization: `Bearer ${ADMIN_TOKEN}`, "Content-Type": "application/json", ...extra };
}

function internalHeaders() {
  return { Authorization: `Bearer ${INTERNAL_TOKEN}` };
}

function request(path, init = {}) {
  return new Request(`${BASE}${path}`, init);
}

async function jsonResponse(res) {
  return res.json();
}

function safeCard(overrides = {}) {
  return {
    title: "Renewal next step",
    lane: "Renewal",
    audience: "member",
    language: "th",
    customer_question_examples: ["ต่ออายุสมาชิกต้องทำยังไง"],
    kenji_safe_answer: "Kenji แนะนำขั้นตอนต่ออายุได้ แต่ต้องรอระบบจริงยืนยันสถานะก่อนครับ",
    do_rules: ["อธิบายขั้นตอนต่อไปอย่างสุภาพ"],
    dont_rules: ["ไม่ยืนยันสถานะแทนระบบ"],
    escalation_rule: "ส่งต่อ Per เมื่อสถานะในระบบไม่ตรงกัน",
    related_routes: ["/sigil/booking"],
    updated_by: "per",
    ...overrides,
  };
}

async function call(envValue, path, init = {}) {
  return handleKenjiKnowledgeRequest(request(path, init), envValue);
}

async function create(envValue, card = safeCard()) {
  return call(envValue, "/v1/admin/kenji/knowledge/draft", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(card),
  });
}

async function createAndReturnCard(envValue, card = safeCard()) {
  const res = await create(envValue, card);
  assert.equal(res.status, 201);
  return (await res.json()).card;
}

test("unmatched route returns null", async () => {
  const res = await handleKenjiKnowledgeRequest(request("/v1/admin/other"), env());
  assert.equal(res, null);
});

test("OPTIONS returns ok", async () => {
  const res = await call(env(), "/v1/admin/kenji/knowledge/list", { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Methods"), "GET,POST,PATCH,OPTIONS");
});

test("admin list rejects unauthorized", async () => {
  const res = await call(env(), "/v1/admin/kenji/knowledge/list");
  const body = await jsonResponse(res);
  assert.equal(res.status, 401);
  assert.equal(body.error, "unauthorized");
});

test("admin list returns empty cards", async () => {
  const res = await call(env(), "/v1/admin/kenji/knowledge/list", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(res.status, 200);
  assert.deepEqual(body.cards, []);
  assert.equal(body.cursor, null);
  assert.equal(body.list_complete, true);
});

test("admin list returns cursor pagination metadata", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ title: "First" }));
  await createAndReturnCard(envValue, safeCard({ title: "Second" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/list?cursor=1", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(res.status, 200);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cursor, null);
  assert.equal(body.list_complete, true);
});

test("admin routes fail safely when KENJI_KNOWLEDGE_KV binding is missing", async () => {
  const res = await call({ ADMIN_BEARER: ADMIN_TOKEN }, "/v1/admin/kenji/knowledge/list", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(res.status, 500);
  assert.equal(body.error, "missing_KENJI_KNOWLEDGE_KV");
});

test("create safe draft stores card", async () => {
  const envValue = env();
  const res = await create(envValue);
  const body = await jsonResponse(res);
  assert.equal(res.status, 201);
  assert.equal(body.card.status, "draft");
  assert.equal(body.card.version, 1);
  assert.equal(Boolean(await envValue.KENJI_KNOWLEDGE_KV.get(`kenji:knowledge:v1:card:${body.card.id}`)), true);
});

test("create review card is allowed", async () => {
  const res = await create(env(), safeCard({ status: "review" }));
  const body = await jsonResponse(res);
  assert.equal(res.status, 201);
  assert.equal(body.card.status, "review");
});

test("create published card is rejected", async () => {
  const res = await create(env(), safeCard({ status: "published" }));
  const body = await jsonResponse(res);
  assert.equal(res.status, 400);
  assert.equal(body.error, "create_cannot_publish");
});

test("unsafe email content is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "ติดต่อ user@example.com" }));
  assert.equal(res.status, 400);
});

test("phone content is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "โทร +66 812 345 678" }));
  assert.equal(res.status, 400);
});

test("LINE ID content is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "ขอ LINE ID จากลูกค้า" }));
  assert.equal(res.status, 400);
});

test("Telegram username content is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "ส่งต่อ @private_user" }));
  assert.equal(res.status, 400);
});

test("Airtable rec id content is rejected", async () => {
  const res = await create(env(), safeCard({ escalation_rule: "อ้างอิง recABCDEFGHIJK123" }));
  assert.equal(res.status, 400);
});

test("payment proof raw content is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "ดู payment_ref_raw และ proof_attached" }));
  assert.equal(res.status, 400);
});

test("dangerous payment approval answer is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "payment approved แล้วครับ" }));
  assert.equal(res.status, 400);
});

test("dangerous membership unlock answer is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "unlock membership ให้แล้วครับ" }));
  assert.equal(res.status, 400);
});

test("dangerous VIP/Black Card answer is rejected", async () => {
  const res = await create(env(), safeCard({ kenji_safe_answer: "grant Black Card ให้ได้เลย" }));
  assert.equal(res.status, 400);
});

test("PATCH cannot publish", async () => {
  const envValue = env();
  const card = await createAndReturnCard(envValue);
  const res = await call(envValue, `/v1/admin/kenji/knowledge/${card.id}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ status: "published" }),
  });
  const body = await jsonResponse(res);
  assert.equal(res.status, 400);
  assert.equal(body.error, "publish_requires_publish_endpoint");
});

test("publish endpoint marks card published", async () => {
  const envValue = env();
  const card = await createAndReturnCard(envValue);
  const res = await call(envValue, `/v1/admin/kenji/knowledge/${card.id}/publish`, {
    method: "POST",
    headers: adminHeaders(),
  });
  const body = await jsonResponse(res);
  assert.equal(res.status, 200);
  assert.equal(body.card.status, "published");
});

test("internal published endpoint returns only published cards", async () => {
  const envValue = env();
  const draft = await createAndReturnCard(envValue, safeCard({ title: "Draft card" }));
  const published = await createAndReturnCard(envValue, safeCard({ title: "Published card" }));
  await call(envValue, `/v1/admin/kenji/knowledge/${published.id}/publish`, { method: "POST", headers: adminHeaders() });

  const res = await call(envValue, "/v1/internal/kenji/knowledge/published", { headers: internalHeaders() });
  const body = await jsonResponse(res);
  assert.equal(res.status, 200);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].id, published.id);
  assert.notEqual(body.cards[0].id, draft.id);
});

test("internal published endpoint rejects unauthorized", async () => {
  const res = await call(env(), "/v1/internal/kenji/knowledge/published");
  assert.equal(res.status, 401);
});

test("archive endpoint marks card archived", async () => {
  const envValue = env();
  const card = await createAndReturnCard(envValue);
  const res = await call(envValue, `/v1/admin/kenji/knowledge/${card.id}/archive`, {
    method: "POST",
    headers: adminHeaders(),
  });
  const body = await jsonResponse(res);
  assert.equal(res.status, 200);
  assert.equal(body.card.status, "archived");
});

test("related internal admin routes are stripped", async () => {
  const envValue = env();
  const card = await createAndReturnCard(envValue, safeCard({
    related_routes: ["/sigil/booking", "/internal/admin/secret", "/v1/admin/kenji/knowledge/list", "https://bad.example"],
  }));
  assert.deepEqual(card.related_routes, ["/sigil/booking"]);
});

test("list filters by status", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ title: "Draft only" }));
  await createAndReturnCard(envValue, safeCard({ title: "Review only", status: "review" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/list?status=review", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].status, "review");
});

test("list filters by lane", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ lane: "Renewal" }));
  await createAndReturnCard(envValue, safeCard({ title: "Payment help", lane: "Payment" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/list?lane=Payment", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].lane, "Payment");
});

test("list filters by language", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ language: "th" }));
  await createAndReturnCard(envValue, safeCard({ title: "English renewal", language: "en" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/list?language=en", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].language, "en");
});

test("list filters by audience", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ audience: "member" }));
  await createAndReturnCard(envValue, safeCard({ title: "Public help", audience: "public" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/list?audience=public", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].audience, "public");
});

test("list filters by query", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ title: "Renewal path" }));
  await createAndReturnCard(envValue, safeCard({ title: "Booking guide", lane: "Booking" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/list?q=booking", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(body.cards.length, 1);
  assert.equal(body.cards[0].title, "Booking guide");
});

test("meta endpoint returns counts", async () => {
  const envValue = env();
  await createAndReturnCard(envValue, safeCard({ lane: "Renewal", status: "draft" }));
  await createAndReturnCard(envValue, safeCard({ title: "Review payment", lane: "Payment", status: "review" }));
  const res = await call(envValue, "/v1/admin/kenji/knowledge/meta", { headers: adminHeaders() });
  const body = await jsonResponse(res);
  assert.equal(res.status, 200);
  assert.equal(body.meta.total, 2);
  assert.equal(body.meta.status.draft, 1);
  assert.equal(body.meta.status.review, 1);
  assert.equal(body.meta.lane.Payment, 1);
});
