import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("./confirmation-route-guard.js", import.meta.url), "utf8");

function token(role) {
  const payload = {
    kind: role === "model" ? "model_confirm" : "customer_confirm",
    role,
    session_id: "sess_guard_test",
  };
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url") + ".signature";
}

function run(href) {
  const redirects = [];
  const location = {
    href,
    replace(value) {
      redirects.push(value);
    },
  };
  const context = {
    window: { location },
    URL,
    Uint8Array,
    TextDecoder,
    atob,
  };
  vm.runInNewContext(source, context);
  return redirects;
}

test("model token opened on customer route moves to model route and preserves query", () => {
  const t = token("model");
  const redirects = run(`https://www.mmdbkk.com/sigil/confirm/job-confirmation?t=${encodeURIComponent(t)}&lang=en#job`);
  assert.deepEqual(redirects, [`/sigil/confirm/job-model?t=${encodeURIComponent(t)}&lang=en#job`]);
});

test("customer token opened on model route moves to customer route", () => {
  const t = token("customer");
  const redirects = run(`https://www.mmdbkk.com/sigil/confirm/job-model?t=${encodeURIComponent(t)}`);
  assert.deepEqual(redirects, [`/sigil/confirm/job-confirmation?t=${encodeURIComponent(t)}`]);
});

test("matching or unreadable tokens do not redirect and remain backend-verified", () => {
  const customer = token("customer");
  assert.deepEqual(run(`https://www.mmdbkk.com/sigil/confirm/job-confirmation?t=${encodeURIComponent(customer)}`), []);
  assert.deepEqual(run("https://www.mmdbkk.com/sigil/confirm/job-confirmation?t=not-a-token"), []);
});
