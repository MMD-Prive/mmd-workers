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
  assert.match(js, /fetch\(STATUS_ENDPOINT,\s*\{\s*credentials:\s*"same-origin",\s*cache:\s*"no-store"\s*\}/);
  assert.match(js, /fetch\(QUEUE_ENDPOINT,\s*\{\s*credentials:\s*"same-origin",\s*cache:\s*"no-store"\s*\}/);
  assert.doesNotMatch(js, /method\s*:\s*["'](?:PATCH|PUT|DELETE)["']/i);
});

test("Kenji Knowledge V10 loader defines live backend endpoints", async () => {
  const js = await source();
  assert.match(js, /KNOWLEDGE_META_ENDPOINT\s*=\s*"\/v1\/admin\/kenji\/knowledge\/meta"/);
  assert.match(js, /KNOWLEDGE_LIST_ENDPOINT\s*=\s*"\/v1\/admin\/kenji\/knowledge\/list"/);
  assert.match(js, /KNOWLEDGE_DRAFT_ENDPOINT\s*=\s*"\/v1\/admin\/kenji\/knowledge\/draft"/);
  assert.match(js, /KNOWLEDGE_PUBLISHED_ENDPOINT\s*=\s*"\/v1\/internal\/kenji\/knowledge\/published"/);
});

test("Kenji Knowledge V10 Save Draft posts only to the draft endpoint", async () => {
  const js = await source();
  assert.equal((js.match(/method\s*:\s*"POST"/g) || []).length, 1);
  assert.match(js, /fetch\(KNOWLEDGE_DRAFT_ENDPOINT,\s*\{[\s\S]*?method\s*:\s*"POST"/);
  assert.match(js, /Save to Backend Draft/);
  assert.match(js, /Save Local Draft/);
  assert.doesNotMatch(js, /\/v1\/admin\/kenji\/knowledge\/:id\/publish/);
  assert.doesNotMatch(js, /\/v1\/admin\/kenji\/knowledge\/[^"']+\/publish/);
  assert.doesNotMatch(js, /\/v1\/admin\/sigil\/board\/publish/);
});

test("Kenji Knowledge V10 loader has no operational approval write calls", async () => {
  const js = await source();
  assert.doesNotMatch(js, /fetch\([^)]*(payment|slip)[^)]*(approve|approved|confirm|paid)/i);
  assert.doesNotMatch(js, /fetch\([^)]*(unlock|membership)[^)]*(unlock|active|grant)/i);
  assert.doesNotMatch(js, /fetch\([^)]*(vip|svip|black[\s_-]*card)[^)]*(grant|approve|unlock)/i);
  assert.doesNotMatch(js, /fetch\([^)]*(booking)[^)]*(confirm|approve)/i);
});

test("Kenji Knowledge V9.2 loader renders into the existing Webflow root", async () => {
  const js = await source();
  assert.match(js, /ROOT_ID\s*=\s*"mmdKenjiKnowledgeV9"/);
  assert.match(js, /root\.classList\.add\("kk4", "kk4--v92"\)/);
  assert.match(js, /root\.innerHTML\s*=\s*renderShell\(\)/);
  assert.doesNotMatch(js, /outerHTML\s*=\s*renderShell\(\)/);
  assert.doesNotMatch(js, /<section id="mmdKenjiKnowledgeV9"/);
});

test("Kenji Knowledge V10 UX includes status strip and quick start choices", async () => {
  const js = await source();
  assert.match(js, /kk4__status-strip/);
  assert.match(js, /Knowledge API/);
  assert.match(js, /Runtime Published/);
  assert.match(js, /Last Sync/);
  assert.match(js, /kk4__quick-start/);
  assert.match(js, /เขียนจากศูนย์/);
  assert.match(js, /ใช้เทมเพลต Payment/);
  assert.match(js, /ใช้เทมเพลต Membership/);
  assert.match(js, /สร้างจาก Board/);
});

test("Kenji Knowledge V10 editor uses guided operator sections and lane notes", async () => {
  const js = await source();
  assert.match(js, /A\. ลูกค้าถามว่าอะไร/);
  assert.match(js, /B\. Kenji ควรตอบอย่างไร/);
  assert.match(js, /C\. กฎความปลอดภัย/);
  assert.match(js, /Payment — สลิป \/ ยอด \/ ชำระเงิน/);
  assert.match(js, /Escalation — ต้องให้ Per\/MMD ตัดสินใจ/);
  assert.match(js, /Kenji รับเรื่องได้ แต่ห้ามยืนยันว่าจ่ายสำเร็จ/);
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
  assert.match(css, /kk4__status-strip/);
  assert.match(css, /kk4__quick-start/);
  assert.match(css, /kk4__editor-section/);
});
