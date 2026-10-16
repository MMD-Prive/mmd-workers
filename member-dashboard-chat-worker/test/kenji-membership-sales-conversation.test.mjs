import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildKenjiLineReply, inferLineIntent } from "../src/index.js";
import { decideKenjiCapability } from "../src/kenji-capability-policy.js";

function event(text) {
  return { type: "message", message: { id: "m-sales-1", type: "text", text } };
}

const profile = { displayName: "Mek" };

test("membership sales uses a natural Per voice and one budget question", () => {
  const reply = buildKenjiLineReply(event("แพ็กเกจสมาชิกราคาเท่าไหร่"), profile);
  assert.match(reply, /คุณ Mek/);
  assert.match(reply, /Standard|Premium/);
  assert.match(reply, /งบต่อครั้ง/);
  assert.doesNotMatch(reply, /Kenji|AI|bot|ทีมงาน/i);
});

test("experience and budget discovery remain short deterministic questions", () => {
  assert.equal(inferLineIntent("เคยใช้บริการที่ไหนมาก่อน"), "membership_experience");
  assert.match(buildKenjiLineReply(event("เคยใช้บริการที่ไหนมาก่อน"), profile), /เคยใช้บริการลักษณะนี้ที่ไหน/);
  assert.equal(inferLineIntent("มีบัทเจทต่อครั้งประมาณ 5,000"), "membership_budget");
  assert.match(buildKenjiLineReply(event("มีบัทเจทต่อครั้งประมาณ 5,000"), profile), /งบต่อครั้ง/);
});

test("unverified customers receive only the Standard Comp Card boundary", () => {
  const reply = buildKenjiLineReply(event("ขอดูตัวอย่าง Comp Card Standard"), profile);
  assert.equal(inferLineIntent("ขอดูตัวอย่าง Comp Card Standard"), "standard_comp_card_preview");
  assert.match(reply, /เฉพาะตัวอย่าง Comp Card แบบ Standard/);
  assert.match(reply, /หลังสมัครและยืนยันตัวตน/);
});

test("entertainment providers stay confidential and Black Card is review only", () => {
  const reply = buildKenjiLineReply(event("ที่นี่มีดาราหรือนักแสดงไหม สนใจ Black Card"), profile);
  assert.equal(inferLineIntent("ที่นี่มีดาราหรือนักแสดงไหม สนใจ Black Card"), "black_card_private_access");
  assert.match(reply, /ไม่เปิดเผยหรือบอกใบ้ว่าเป็นใคร/);
  assert.match(reply, /รับการพิจารณา Black Card/);
  assert.match(reply, /ไม่ได้รับประกัน/);
  assert.doesNotMatch(reply, /อนุมัติแล้ว|ได้สิทธิ์แล้ว|เข้าถึงได้แล้ว/);
});

test("new sales intents are deterministic and cannot enter free-form model generation", () => {
  for (const text of [
    "ที่นี่มีดาราหรือนักแสดงไหม สนใจ Black Card",
    "ขอดูตัวอย่าง Comp Card Standard",
    "เคยใช้บริการที่ไหนมาก่อน",
    "มีบัทเจทต่อครั้งประมาณ 5,000",
  ]) {
    const intent = inferLineIntent(text);
    assert.equal(decideKenjiCapability({ text, intent }).capability, "deterministic_truth");
  }
});

test("model switch is enabled but exact-hash and knowledge allowlists remain empty", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(config, /^LINE_KENJI_MODEL_ENABLED\s*=\s*"true"$/m);
  assert.match(config, /^LINE_KENJI_MODEL_CANARY_HASHES\s*=\s*""$/m);
  assert.match(config, /^LINE_KENJI_MODEL_KNOWLEDGE_IDS\s*=\s*""$/m);
});
