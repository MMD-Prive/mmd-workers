import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const ingress = readFileSync(new URL("../src/customer-360-live-ingress-wrapper.ts", import.meta.url), "utf8");

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

test("workers.dev ingress hands legacy public payment/member paths back to mmdbkk.com", () => {
  assert.match(ingress, /const CANONICAL_PUBLIC_ORIGIN = ["']https:\/\/mmdbkk\.com["']/);
  assert.match(ingress, /const WORKERS_DEV_SUFFIX = ["']\.workers\.dev["']/);
  for (const path of [
    "/member/dashboard",
    "/sigil/member/membership",
    "/member/payments",
    "/sigil/pay/renew",
    "/sigil/pay/membership",
    "/pay/membership",
    "/sigil/pay/payment",
  ]) {
    assert.equal(ingress.includes(`"${path}"`), true, path);
  }
  assert.equal(ingress.includes('target.searchParams.set("t", token)'), true);
  assert.equal(ingress.includes('new URL("/sigil/pay", CANONICAL_PUBLIC_ORIGIN)'), true);
  assert.equal(ingress.includes('new URL("/sigil/member/membership", CANONICAL_PUBLIC_ORIGIN)'), true);
});

test("immigrate-worker fallback member renderers are not payment authority", () => {
  assert.match(source, /const MEMBER_MEMBERSHIP_ALIAS_PATH = ["']\/sigil\/member\/membership["']/);
  assert.equal(source.includes("promptpay.io"), false);
  assert.equal(source.includes("0829528889"), false);
  assert.equal(source.includes("233-2-98800-1"), false);
  assert.equal(source.includes("amount_due_thb"), false);
  assert.equal(source.includes("/v1/pay/verify"), false);
});
