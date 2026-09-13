import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("immigrate-worker has no public membership/payment route ownership", () => {
  for (const forbidden of [
    'pattern = "mmdbkk.com/pay/',
    'pattern = "www.mmdbkk.com/pay/',
    'pattern = "mmdbkk.com/sigil/pay/',
    'pattern = "www.mmdbkk.com/sigil/pay/',
    'pattern = "mmdbkk.com/member/',
    'pattern = "www.mmdbkk.com/member/',
    'pattern = "mmdbkk.com/sigil/member/',
    'pattern = "www.mmdbkk.com/sigil/member/',
  ]) {
    assert.equal(wrangler.includes(forbidden), false, forbidden);
  }
});

test("immigrate-worker fallback member renderers are not payment authority", () => {
  assert.match(source, /const MEMBER_MEMBERSHIP_ALIAS_PATH = ["']\/sigil\/member\/membership["']/);
  assert.equal(source.includes("promptpay.io"), false);
  assert.equal(source.includes("0829528889"), false);
  assert.equal(source.includes("233-2-98800-1"), false);
  assert.equal(source.includes("amount_due_thb"), false);
  assert.equal(source.includes("/v1/pay/verify"), false);
});
