import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const jsPath = new URL("./kenji-knowledge-v9-1-webflow-loader.js", import.meta.url);
const cssPath = new URL("./kenji-knowledge-v9-board-bridge.css", import.meta.url);

async function source() {
  return readFile(jsPath, "utf8");
}

test("Kenji Knowledge V9.2 bridge reads SIGIL Board only and never calls publish or mutation routes", async () => {
  const js = await source();
  assert.match(js, /STATUS_ENDPOINT\s*=\s*"\/v1\/sigil\/board\/status"/);
  assert.match(js, /QUEUE_ENDPOINT\s*=\s*"\/v1\/sigil\/board\/queue"/);
  assert.doesNotMatch(js, /\/v1\/admin\/sigil\/board\/publish/);
  assert.doesNotMatch(js, /method\s*:\s*["'](?:POST|PATCH|PUT|DELETE)["']/i);
  assert.doesNotMatch(js, /fetch\([^\n]*(?:POST|PATCH|PUT|DELETE)/i);
});

test("Kenji Knowledge V9.2 loader renders into the existing Webflow root", async () => {
  const js = await source();
  assert.match(js, /ROOT_ID\s*=\s*"mmdKenjiKnowledgeV9"/);
  assert.match(js, /root\.classList\.add\("kk4", "kk4--v92"\)/);
  assert.match(js, /root\.innerHTML\s*=\s*renderShell\(\)/);
  assert.doesNotMatch(js, /outerHTML\s*=\s*renderShell\(\)/);
  assert.doesNotMatch(js, /<section id="mmdKenjiKnowledgeV9"/);
});

test("Kenji Knowledge V9.2 bridge displays required read-only safety banner", async () => {
  const js = await source();
  assert.match(js, /Board data is advisory read-only\. Kenji cannot approve, unlock, confirm, or write operational changes\./);
  assert.match(js, /ข้อมูลจาก Board เป็นสัญญาณอ่านอย่างเดียว/);
  assert.match(js, /ไม่สามารถอนุมัติสลิป เปิดสมาชิก ยืนยันการจอง หรือปลดล็อกสิทธิ์ใด ๆ ได้/);
});

test("Kenji Knowledge V9.2 bridge projects only approved board card keys", async () => {
  const js = await source();
  assert.match(js, /BOARD_CARD_KEYS\s*=\s*\["id", "title", "lane", "status", "priority", "risk", "next_action", "owner", "needs_per_decision", "summary"\]/);
  assert.match(js, /function sanitizeBoardCard/);
  assert.doesNotMatch(js, /airtable_record_id|raw_payload|line_user_id|telegram_id|slip_url|secret|passphrase|api_key/);
});

test("Kenji Knowledge V9.2 bridge builds local draft helper with approved draft fields", async () => {
  const js = await source();
  for (const field of [
    "title",
    "lane",
    "audience",
    "language",
    "customer_question_examples",
    "kenji_safe_answer",
    "do_rules",
    "dont_rules",
    "escalation_rule",
    "related_routes"
  ]) {
    assert.match(js, new RegExp(`${field}:`));
  }
  assert.match(js, /audience:\s*"internal_only"/);
  assert.match(js, /language:\s*"th"/);
  assert.match(js, /status:\s*"draft"/);
  assert.match(js, /function mapBoardLaneToKnowledgeLane/);
  assert.match(js, /function buildDraftFromBoardCard/);
});

test("Kenji Knowledge V9.2 CSS contains bridge UI states", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /kk4__safety-banner/);
  assert.match(css, /kk4__board-card\.is-selected/);
  assert.match(css, /kk4__assistant-lines/);
});
