import assert from "node:assert/strict";
import test from "node:test";
import { resolveKenjiLineReply } from "../src/index.js";

// Synthetic identity only; this test never contacts LINE or production services.
const userId = `U${"1".repeat(32)}`;
for (const level of ["public_member", "private_standard", "private_premium", "vip", "svip", "black_card"]) {
  test(`live ${level} reaches the Per reply without a signup pitch`, async () => {
    let truthReads = 0;
    const env = {
      MEMBER_PAGES_WORKER: { fetch: async (request) => {
        truthReads += 1;
        assert.equal(new URL(request.url).pathname, "/__internal/kenji/member-truth");
        assert.equal((await request.json()).line_user_id, userId);
        return Response.json({
          ok: true, authority: "my_mmd_entitlement_resolver_v1",
          identity_status: "resolved", display_name: "Test Member",
          membership: { level, lifecycle: "active" },
        });
      } },
    };
    const reply = await resolveKenjiLineReply({
      type: "message", source: { type: "user", userId },
      message: { type: "text", text: "Kenji" },
    }, {}, env);
    assert.equal(truthReads, 1);
    assert.match(reply.text, /เปอร์/);
    assert.doesNotMatch(reply.text, /สมัคร|Public Package|HITO|ต่ออายุ/);
    assert.equal(reply.model_attempted, false);
  });
}
