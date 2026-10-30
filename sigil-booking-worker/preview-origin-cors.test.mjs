import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./src/runtime-index.js";

const preview = "https://sigil-booking-app-preview.malemodel-bkk.workers.dev";
const published = "https://sigil-bookings.lovable.app";
const config = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const origins = config.match(/^ALLOWED_ORIGINS = "([^"]+)"/m)?.[1];
const env = {
  ALLOWED_ORIGINS: origins,
  AIRTABLE_API_KEY: "fixture-only",
  AIRTABLE_BASE_ID: "appFixture",
};
const baseline = ["https://mmdbkk.com", "https://www.mmdbkk.com", "https://sigil.mmdbkk.com", "https://mmdprive.com", "https://www.mmdprive.com", "https://mmdprive.webflow.io", "https://id-preview--4a567363-c3ea-4ee4-aa32-4a6d5c79808a.lovable.app", "https://sigil-booking.lovable.app", preview];

function assertCors(response, origin) {
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("vary"), /\bOrigin\b/);
  assert.ok(response.headers.get("cache-control").split(",").map(value => value.trim()).includes("no-store"));
}

function emptyAirtable(t) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).hostname, "api.airtable.com");
    assert.equal(request.method, "GET", "CORS tests must never write booking data");
    calls.push(request.url);
    return Response.json({ records: [] });
  });
  return calls;
}

test("configuration adds only the exact published Lovable origin and preserves existing origins", () => {
  assert.deepEqual(origins.split(","), [...baseline, published]);
});

for (const origin of [preview, published]) {
  test(`approved origin supports credentialed search, resolve, intake and media preflight: ${origin}`, async (t) => {
    const calls = emptyAirtable(t);
    for (const [path, method, headers] of [
      ["models/search", "GET", ""],
      ["client/resolve", "POST", "content-type"],
      ["booking/intake", "POST", "content-type"],
      ["models/media/media_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "GET", "range"],
    ]) {
      const result = await worker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/${path}`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers },
      }), env, {});
      assert.equal(result.status, 204, path);
      assertCors(result, origin);
      assert.ok(result.headers.get("access-control-allow-methods").split(",").includes(method));
      if (headers) assert.ok(result.headers.get("access-control-allow-headers").toLowerCase().split(",").map(value => value.trim()).includes(headers));
    }
    assert.equal(calls.length, 0);
  });

  test(`Public search returns browser-readable results: ${origin}`, async (t) => {
    const calls = emptyAirtable(t);
    const result = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=public", {
      headers: { Origin: origin }, credentials: "include",
    }), env, {});
    assert.equal(result.status, 200);
    assertCors(result, origin);
    const body = await result.json();
    assert.equal(body.ok, true);
    assert.deepEqual(body.items, []);
    assert.ok(calls.length > 0);
  });

  test(`CORS approval and client-supplied membership never grant Private entitlement: ${origin}`, async (t) => {
    emptyAirtable(t);
    const result = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=private&member_status=active&access_scope=public_private&can_search_private_models=true&selected_access_folder=premium", {
      headers: { Origin: origin }, credentials: "include",
    }), env, {});
    const body = await result.json();
    assert.equal(result.status, 200);
    assertCors(result, origin);
    assert.equal(body.blocked, true);
    assert.equal(body.visibility_enforced, true);
    assert.deepEqual(body.allowed_model_folders, []);
    assert.deepEqual(body.items, []);
  });

  test(`Private intake rejection remains readable and makes no writes: ${origin}`, async (t) => {
    emptyAirtable(t);
    const result = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify({ lane: "private", member_status: "active", access_scope: "public_private" }),
    }), env, {});
    assert.equal(result.status, 403);
    assertCors(result, origin);
    assert.equal((await result.json()).error, "private_requires_current_entitlement");
  });
}

test("lookalike, sibling, suffix, HTTP and null origins remain rejected before search or media reads", async (t) => {
  const calls = emptyAirtable(t);
  for (const origin of [preview + ".evil.example", published + ".evil.example", "https://other.lovable.app", "https://other.malemodel-bkk.workers.dev", "http://sigil-bookings.lovable.app", "null"]) {
    for (const path of ["models/search", "models/media/media_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]) {
      const result = await worker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/${path}`, { headers: { Origin: origin } }), env, {});
      assert.equal(result.status, 403, origin);
      assert.equal(result.headers.get("access-control-allow-origin"), null);
      assert.equal(result.headers.get("access-control-allow-credentials"), null);
    }
  }
  assert.equal(calls.length, 0);
});
