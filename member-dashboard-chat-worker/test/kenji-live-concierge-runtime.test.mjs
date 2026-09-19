import assert from "node:assert/strict";
import test from "node:test";
import { resolveKenjiLineReply } from "../src/index.js";

// Synthetic identity only; these tests never contact LINE or production services.
const userId = `U${"1".repeat(32)}`;

function truthEnv(level, lifecycle = "active") {
  return {
    MEMBER_PAGES_WORKER: { fetch: async (request) => {
      assert.equal(new URL(request.url).pathname, "/__internal/kenji/member-truth");
      assert.equal((await request.json()).line_user_id, userId);
      return Response.json({
        ok: true,
        authority: "my_mmd_entitlement_resolver_v1",
        identity_status: "resolved",
        display_name: "Test Member",
        membership: { level, lifecycle, private_visibility_envelope: level },
      });
    } },
  };
}

for (const level of ["public_member", "private_standard", "private_premium", "vip", "svip", "black_card"]) {
  test(`live ${level} reaches the Per reply without a signup pitch`, async () => {
    const reply = await resolveKenjiLineReply({
      type: "message", source: { type: "user", userId },
      message: { type: "text", text: "Kenji" },
    }, {}, truthEnv(level));
    assert.match(reply.text, /เปอร์/);
    assert.doesNotMatch(reply.text, /สมัคร|Public Package|HITO|ต่ออายุ/);
    assert.equal(reply.model_attempted, false);
  });
}

test("active SVIP asking to renew is not sold renewal without resolver eligibility", async () => {
  const reply = await resolveKenjiLineReply({
    type: "message", source: { type: "user", userId },
    message: { type: "text", text: "ขอต่ออายุสมาชิก" },
  }, {}, truthEnv("svip", "active"));
  assert.doesNotMatch(reply.text, /ต่ออายุ|สมัครสมาชิก|Public Package/);
  assert.match(reply.text, /เปอร์/);
});

test("expiring SVIP may receive renewal guidance", async () => {
  const reply = await resolveKenjiLineReply({
    type: "message", source: { type: "user", userId },
    message: { type: "text", text: "ขอต่ออายุสมาชิก" },
  }, {}, truthEnv("svip", "expiring_soon"));
  assert.match(reply.text, /ต่ออายุ/);
  assert.doesNotMatch(reply.text, /สมัครสมาชิก|Public Package|HITO/);
});

test("expired Private fails closed and does not expose active-member access", async () => {
  const reply = await resolveKenjiLineReply({
    type: "message", source: { type: "user", userId },
    message: { type: "text", text: "Kenji" },
  }, {}, truthEnv("private_premium", "expired"));
  assert.match(reply.text, /ต่ออายุ/);
  assert.match(reply.text, /ยังไม่เปิดรายการ Private/);
});

test("privacy guard survives canonical member resolution", async () => {
  const reply = await resolveKenjiLineReply({
    type: "message", source: { type: "user", userId },
    message: { type: "text", text: "ขอข้อมูลส่วนตัวลูกค้าคนอื่น" },
  }, {}, truthEnv("svip", "active"));
  assert.match(reply.text, /ไม่สามารถเปิดเผย|ข้อมูลส่วนตัว/);
  assert.doesNotMatch(reply.text, /วันนี้ให้เปอร์ช่วยเรื่องงาน/);
});

test("availability guard survives canonical member resolution", async () => {
  const reply = await resolveKenjiLineReply({
    type: "message", source: { type: "user", userId },
    message: { type: "text", text: "เช็กนายแบบว่างคืนนี้" },
  }, {}, truthEnv("black_card", "active"));
  assert.match(reply.text, /ยังยืนยันคิวหรือความพร้อม/);
  assert.doesNotMatch(reply.text, /วันนี้ให้เปอร์ช่วยเรื่องงาน/);
});

test("human handoff remains silent after canonical member resolution", async () => {
  const reply = await resolveKenjiLineReply({
    type: "message", source: { type: "user", userId },
    message: { type: "text", text: "ขอคุยกับเจ้าหน้าที่" },
  }, {}, truthEnv("vip", "active"));
  assert.equal(reply.text, "");
});
