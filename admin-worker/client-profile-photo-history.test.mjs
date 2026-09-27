import test from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_PROFILE_PHOTO_SYNC_PATH,
  handleClientProfilePhotoSync,
  isClientProfilePhotoSyncRequest,
} from "./src/client-profile-photo-history.js";

const actor = { id: "owner-test", role: "owner" };
const env = {
  AIRTABLE_API_KEY: "airtable-test",
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_TABLE_CLIENTS_ID: "clients",
  LINE_CHANNEL_ACCESS_TOKEN: "line-test",
};

function req(clientId = "recClient12345678") {
  return new Request("https://mmdbkk.com" + CLIENT_PROFILE_PHOTO_SYNC_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });
}

test("route predicate is POST-only and exact", () => {
  assert.equal(isClientProfilePhotoSyncRequest(CLIENT_PROFILE_PHOTO_SYNC_PATH, "POST"), true);
  assert.equal(isClientProfilePhotoSyncRequest(CLIENT_PROFILE_PHOTO_SYNC_PATH, "GET"), false);
  assert.equal(isClientProfilePhotoSyncRequest("/v1/admin/clients/recent", "POST"), false);
});

test("new LINE photo is prepended and rolling album is capped at 8", async () => {
  const originalFetch = globalThis.fetch;
  const existing = Array.from({ length: 8 }, (_, i) => ({
    id: `attOld${i + 1}`,
    url: `https://airtable.example/old-${i + 1}.jpg`,
    filename: `old-${i + 1}.jpg`,
  }));
  let patchBody = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.line.me") {
      return Response.json({ pictureUrl: "https://profile.line-scdn.net/current-avatar" });
    }
    if (url.hostname === "api.airtable.com" && (init.method || "GET") === "GET") {
      return Response.json({ id: "recClient12345678", fields: { line_user_id: "U123", "Profile Photo": existing } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "PATCH") {
      patchBody = JSON.parse(init.body);
      const incoming = patchBody.fields["Profile Photo"];
      assert.equal(incoming.length, 8);
      assert.match(incoming[0].filename, /^line-profile-[0-9a-f]{20}\.jpg$/);
      assert.equal(incoming[0].url, "https://profile.line-scdn.net/current-avatar");
      assert.deepEqual(incoming.slice(1), existing.slice(0, 7).map((item) => ({ id: item.id })));
      return Response.json({
        id: "recClient12345678",
        fields: {
          line_user_id: "U123",
          "Profile Photo": [
            { id: "attNew", url: "https://airtable.example/current.jpg", filename: incoming[0].filename },
            ...existing.slice(0, 7),
          ],
        },
      });
    }
    throw new Error("unexpected fetch " + url);
  };

  try {
    const response = await handleClientProfilePhotoSync(req(), env, actor);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.synced, true);
    assert.equal(body.added, true);
    assert.equal(body.profile_photos.length, 8);
    assert.equal(body.profile_photos[0], "https://airtable.example/current.jpg");
    assert.ok(patchBody);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("same LINE picture fingerprint does not append a duplicate", async () => {
  const originalFetch = globalThis.fetch;
  const pictureUrl = "https://profile.line-scdn.net/same-avatar";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pictureUrl));
  const token = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
  const existing = [{
    id: "attCurrent",
    url: "https://airtable.example/current.jpg",
    filename: `line-profile-${token}.jpg`,
  }];
  let patches = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.line.me") return Response.json({ pictureUrl });
    if (url.hostname === "api.airtable.com" && (init.method || "GET") === "GET") {
      return Response.json({ id: "recClient12345678", fields: { line_user_id: "U123", "Profile Photo": existing } });
    }
    if (url.hostname === "api.airtable.com" && init.method === "PATCH") {
      patches += 1;
      return Response.json({ id: "recClient12345678", fields: { "Profile Photo": existing } });
    }
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleClientProfilePhotoSync(req(), env, actor);
    const body = await response.json();
    assert.equal(body.added, false);
    assert.equal(body.profile_photos.length, 1);
    assert.equal(patches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
