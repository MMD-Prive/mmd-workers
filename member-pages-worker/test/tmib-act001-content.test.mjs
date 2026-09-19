import test from "node:test";
import assert from "node:assert/strict";
import { isTmibAct001ContentPath, TMIB_ACT001_STORY } from "../src/tmib-act001-content.js";

test("ACT 001 narrative is exposed only from the protected content route", () => {
  assert.equal(isTmibAct001ContentPath("https://mmdbkk.com/member/api/liff/tmib/episodes/act-001/content"), true);
  assert.equal(isTmibAct001ContentPath("https://mmdbkk.com/tmib/act-001"), false);
});

test("ACT 001 protected narrative contains frames 04 through 20 in order", () => {
  assert.equal(TMIB_ACT001_STORY.frames.length, 17);
  assert.deepEqual(TMIB_ACT001_STORY.frames.map((item) => item.frame), Array.from({ length:17 }, (_,i) => String(i + 4).padStart(2, "0")));
  assert.equal(TMIB_ACT001_STORY.frames[11].quote, "ถ้ากูสอบไม่ติด มึงจะยังเป็นเพื่อนกับกูอยู่มั้ย");
  assert.equal(TMIB_ACT001_STORY.frames[12].quote, "กูกับมึง คือเพื่อนกันตลอดไป มึงจำไว้");
  assert.match(TMIB_ACT001_STORY.frames[16].title, /คืนนี้ไม่มีอะไรต้องกังวลอีกแล้ว/);
});
