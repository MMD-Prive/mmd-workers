import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "./src/runtime-index.js";

const preview = "https://sigil-booking-app-preview.malemodel-bkk.workers.dev";
const config = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const origins = config.match(/^ALLOWED_ORIGINS = "([^"]+)"/m)?.[1];
const env = { ALLOWED_ORIGINS: origins };
const baseline = ["https://mmdbkk.com", "https://www.mmdbkk.com", "https://sigil.mmdbkk.com", "https://mmdprive.com", "https://www.mmdprive.com", "https://mmdprive.webflow.io", "https://id-preview--4a567363-c3ea-4ee4-aa32-4a6d5c79808a.lovable.app", "https://sigil-booking.lovable.app"];

test("configuration adds exactly the approved Preview origin and preserves existing origins", () => {
  assert.deepEqual(origins.split(","), [...baseline, preview]);
});

test("approved Preview preflight has exact ACAO, Vary and no credentialed CORS", async () => {
  const result = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search", {
    method: "OPTIONS", headers: { Origin: preview, "Access-Control-Request-Method": "GET" },
  }), env, {});
  assert.equal(result.status, 204);
  assert.equal(result.headers.get("access-control-allow-origin"), preview);
  assert.equal(result.headers.get("vary"), "Origin");
  assert.equal(result.headers.get("access-control-allow-credentials"), null);
});

test("lookalike, sibling, suffix and null origins remain rejected without backend access", async () => {
  for (const origin of [preview + ".evil.example", "https://other.malemodel-bkk.workers.dev", "http://sigil-booking-app-preview.malemodel-bkk.workers.dev", "null"]) {
    const result = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search", { headers: { Origin: origin } }), env, {});
    assert.equal(result.status, 403, origin);
    assert.equal(result.headers.get("access-control-allow-origin"), null);
  }
});

test("CORS approval does not grant Private model entitlement", async () => {
  const result = await worker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=private", { headers: { Origin: preview } }), env, {});
  const body = await result.json();
  assert.equal(body.blocked, true);
  assert.deepEqual(body.items, []);
  assert.equal(result.headers.get("access-control-allow-origin"), preview);
});
