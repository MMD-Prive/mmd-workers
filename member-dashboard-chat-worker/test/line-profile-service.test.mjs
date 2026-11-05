import test from "node:test";
import assert from "node:assert/strict";
import { handleServiceBoundLineProfile } from "../src/line-profile-service.mjs";

const id = "U" + "b".repeat(32);
const post = (body) => new Request("https://member-dashboard-chat-worker.local/__internal/line/profile", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("returns picture url and sends the OA token only to LINE", async () => {
  let seen;
  const res = await handleServiceBoundLineProfile(post({ line_user_id: id }), { LINE_CHANNEL_ACCESS_TOKEN: "tok" }, async (url, init) => {
    seen = { url, auth: init.headers.authorization };
    return Response.json({ pictureUrl: "https://profile.line-scdn.net/x", displayName: "N" });
  });
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.picture_url, "https://profile.line-scdn.net/x");
  assert.equal(seen.auth, "Bearer tok");
  assert.ok(!JSON.stringify(body).includes("tok"));
});

test("rejects malformed ids, missing token and reports LINE status", async () => {
  assert.equal((await handleServiceBoundLineProfile(post({ line_user_id: "nope" }), { LINE_CHANNEL_ACCESS_TOKEN: "t" })).status, 400);
  assert.equal((await handleServiceBoundLineProfile(post({ line_user_id: id }), {})).status, 503);
  const res = await handleServiceBoundLineProfile(post({ line_user_id: id }), { LINE_CHANNEL_ACCESS_TOKEN: "t" }, async () => new Response("{}", { status: 404 }));
  assert.equal((await res.json()).error, "line_profile_http_404");
});
