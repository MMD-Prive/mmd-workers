import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./sigil-confirm-brand-swap-v1.js", import.meta.url), "utf8");

test("brand swap only runs on the four SIGIL confirm pages", () => {
  const guard = src.match(/if \(!(\/\^\\\/sigil\\\/confirm\\\/\(.+?\)\/)\.test\(location\.pathname\)\) return;/);
  assert.ok(guard, "path guard present");
  const re = new RegExp(guard[1].slice(1, -1));
  for (const p of ["job-confirmation", "job-model", "payment-confirmation", "model-confirmation"]) assert.ok(re.test(`/sigil/confirm/${p}`), p);
  for (const p of ["/", "/member/my-mmd", "/sigil/pay", "/sigil/confirm"]) assert.equal(re.test(p), false, p);
});

test("neutral Partner links keep the brand block untouched", () => {
  assert.match(src, /data-mmd-neutral/);
});

test("uses the SIGIL SYSTEM logo asset and has no network calls", () => {
  assert.match(src, /6aee826654df354be4f72513_sigil-system-logo-v1\.png/);
  assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon/);
});
