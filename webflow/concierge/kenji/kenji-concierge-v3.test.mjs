import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./kenji-concierge-v3.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./kenji-concierge-v3.css", import.meta.url), "utf8");
const javascript = readFileSync(new URL("./kenji-concierge-v3.js", import.meta.url), "utf8");

test("HTML keeps one v3 scoped root and unique IDs", () => {
  assert.match(html, /id="kenji-concierge-v3"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("member truth and customer routes remain canonical", () => {
  assert.match(html, /data-profile-endpoint="\/member\/api\/my-mmd\/profile"/);
  for (const route of ["/member/kenji-ai-20", "/member/my-mmd", "/booking", "/recovery"]) {
    assert.ok(html.includes(route), `missing route: ${route}`);
  }
});

test("customer-facing ownership remains MMD-masked", () => {
  assert.doesNotMatch(html, /Boss Per/i);
  assert.match(html, /ขั้นตอนของ MMD/);
});

test("contrast safety layer remains last", () => {
  const marker = "FINAL MMD CONTRAST SAFETY LAYER";
  assert.ok(css.includes(marker));
  assert.ok(css.lastIndexOf(marker) > css.lastIndexOf("@media(prefers-reduced-motion:reduce)"));
  assert.match(css, /-webkit-text-fill-color:var\(--cream\)!important/);
  assert.match(css, /--cream:#fffaf0/);
  assert.match(css, /--gold:#ffc247/);
});

test("runtime parses and fails closed", () => {
  const source = javascript.replace(/^<script>\s*/, "").replace(/\s*<\/script>\s*$/, "");
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /credentials:"include"/);
  assert.match(source, /data\.unauthenticated\?\{mode:"guest"\}/);
  assert.match(source, /mode==="pending"\|\|mode==="blocked"/);
  assert.doesNotMatch(source, /DEMO_ONLY|Math\.random|default.{0,12}points/i);
});

test("mobile-first interaction and accessibility hooks remain present", () => {
  assert.match(css, /scroll-snap-type:inline mandatory/);
  assert.match(css, /\.kj3-dock/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<details class="kj3-disclosure kj3-reveal">/);
});
