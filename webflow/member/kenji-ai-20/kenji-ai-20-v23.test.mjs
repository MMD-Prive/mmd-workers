import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const base = new URL("./", import.meta.url);
const html = await readFile(new URL("kenji-ai-20-v23.html", base), "utf8");
const css = await readFile(new URL("kenji-ai-20-v23.css", base), "utf8");
const js = await readFile(new URL("kenji-ai-20-v23.js", base), "utf8");

const suppliedAssets = [
  "6aa17210646c5858de50f062_Kenji%20Conciierge.webp",
  "6a825481b13e7b41163a7625_KENJI_RI%20H_MENU.webp",
  "6a72e43d9ea88b919620ed07_Kenji%20-%20Login.webp",
  "6a6d297a0ba7bff301b0518d_ChatGPT%20Image%20Aug%201%2C%202026%2C%2001_56_15%20AM.webp",
  "6a6d2979803ce40d0b340f51_Kenji%20-%206%20YEARS%20CARE%20BACK%20Desk.webp",
  "6a56f951825c9b71c0900b98_Kenji%20Know05.webp",
  "6a56f9517de7ea880dcda72b_Kenji%20Know033.webp",
  "6a571c5661f12e9fdd42d428_Kenji%20Renewal%2004.webp",
  "6a53fc678a5fd1103021870d_Kenji%20Session04.webp",
  "6a53f69acbeb7e4ee69f9a9e_Kenji%20Session04.webp",
  "6a4f769589377f52692a297d_Kenji%20status.webp",
];

test("v23 markup contains the canonical build marker and all supplied Kenji visuals", () => {
  assert.match(html, /kenji-ai-20-v23-sigil-system-20260910/);
  for (const asset of suppliedAssets) assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), asset);
});

test("v23 uses canonical My MMD BFF and current customer routes", () => {
  assert.match(html, /data-dashboard-endpoint="\/api\/member\/app\/dashboard"/);
  for (const route of ["/my-mmd/profile", "/my-mmd/membership", "/my-mmd/history", "/confirm/payment-proof", "/sigil/recovery"]) {
    assert.ok(html.includes(route), route);
  }
  for (const route of ["'/booking'", "'/sigil/booking'", "'/my-mmd/points'", "'/male-massage/home'", "'/rules/customer'"]) {
    assert.ok(js.includes(route), route);
  }
  assert.ok(!js.includes("'/member/membership'"));
  assert.ok(!js.includes("'/member/dashboard'"));
});

test("v23 member reads fail closed and do not propagate legacy query tokens", () => {
  assert.match(js, /credentials:'include'/);
  assert.match(js, /cache:'no-store'/);
  assert.match(js, /renderSignedOut/);
  assert.match(js, /renderUnavailable/);
  assert.doesNotMatch(js, /searchParams\.get\(['\"]t['\"]\)/);
  assert.doesNotMatch(js, /searchParams\.set\(['\"]t['\"]\)/);
});

test("v23 has TH EN ZH runtime copy and safe concierge boundaries", () => {
  assert.match(js, /th:\{/);
  assert.match(js, /en:\{/);
  assert.match(js, /zh:\{/);
  assert.match(html, /data-k23-lang="th"/);
  assert.match(html, /data-k23-lang="en"/);
  assert.match(html, /data-k23-lang="zh"/);
  assert.match(html, /Payment proof/);
  assert.match(html, /Actual Access/);
});

test("v23 styles use verified site fonts and explicit responsive density controls", () => {
  assert.match(css, /"Canela"/);
  assert.match(css, /"LINE Seed Sans TH"/);
  assert.match(css, /@media screen and \(max-width:479px\)/);
  assert.match(css, /@media screen and \(min-width:960px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("v23 browser runtime parses", () => {
  assert.doesNotThrow(() => new Function(js));
});
