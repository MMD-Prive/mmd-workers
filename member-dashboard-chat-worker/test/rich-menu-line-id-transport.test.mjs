import test from "node:test";
import assert from "node:assert/strict";
import { showMmdRichMenus, getMmdRichMenuVersion, handleMmdRichMenuScheduledRequest } from "../src/mmd-rich-menu-scheduled-runtime.mjs";

test("unknown and smoke IDs cannot poison bulk menu assignment; valid members keep the correct menu", async () => {
  const ids = { guest: `U${"1".repeat(32)}`, public: `U${"2".repeat(32)}`, private: `U${"3".repeat(32)}` };
  const clients = Object.entries(ids).map(([key, id]) => ({ fields: { line_user_id: id, "Verification Status": key === "guest" ? "pending" : "verified" } }));
  clients.push(...["unknown", "U_SMOKE_ACCEPTANCE", "line-test", `U${"z".repeat(32)}`].map(id => ({ fields: { line_user_id: id, "Verification Status": "verified" } })));
  const ents = [{ fields: { line_user_id: ids.private, capability: "private_premium", member_lifecycle_status: "active", expire_at: "2099-12-31T00:00:00Z" } }];
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("api.airtable.com")) return Response.json({ records: url.includes("tblVv58TCbwh5j1fS") ? clients : ents });
    if (url.endsWith("/richmenu/list")) return Response.json({ richmenus: Object.keys(ids).map(key => ({ richMenuId: `${key}-menu`, name: `MMD ${key[0].toUpperCase() + key.slice(1)} ${getMmdRichMenuVersion()}` })) });
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    return Response.json({});
  };
  try {
    const result = await showMmdRichMenus({ LINE_CHANNEL_ACCESS_TOKEN: "test", AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "test" });
    assert.equal(result.visible, true);
    assert.equal(result.skipped_invalid_line_ids, 4);
    assert.deepEqual(result.counts, { guest_known: 1, public: 1, private: 1 });
    assert.deepEqual(calls.find(call => call.url.endsWith("/bulk/unlink")).body.userIds, [ids.guest]);
    for (const key of ["public", "private"])
      assert.deepEqual(calls.find(call => call.body?.richMenuId === `${key}-menu`).body.userIds, [ids[key]]);
    assert.ok(calls.some(call => call.url.endsWith("/user/all/richmenu/guest-menu")));
  } finally { globalThis.fetch = original; }
});

test("invalid single-user sync IDs fail before calling LINE or Airtable", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("No outbound request permitted"); };
  try {
    const response = await handleMmdRichMenuScheduledRequest(new Request("https://worker.internal/v1/internal/line/rich-menu/sync", {
      method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: JSON.stringify({ line_user_id: "unknown" }),
    }), { INTERNAL_TOKEN: "test" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "line_user_id_invalid");
  } finally { globalThis.fetch = original; }
});
