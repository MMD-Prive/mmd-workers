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
  assert.match(html, /data-profile-endpoint="\/member\/api\/liff\/profile"/);
  assert.doesNotMatch(html, /\/member\/api\/my-mmd\/profile/);
  for (const route of ["/member/kenji-ai-20", "/member/my-mmd", "/booking", "/recovery"]) {
    assert.ok(html.includes(route), `missing route: ${route}`);
  }
});

test("customer-facing ownership remains MMD-masked", () => {
  assert.doesNotMatch(html, /Boss Per|Admin|Handler|Operator/i);
  assert.match(html, /ขั้นตอนของ MMD/);
});

test("contrast and typography safety remain canonical", () => {
  const marker = "FINAL MMD CONTRAST SAFETY LAYER";
  assert.ok(css.includes(marker));
  assert.ok(css.lastIndexOf(marker) > css.lastIndexOf("@media(prefers-reduced-motion:reduce)"));
  assert.match(css, /font-family:"LINE Seed Sans TH","Noto Sans Thai"/);
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

test("mobile branch navigation satisfies the long-page contract", () => {
  const chapters = [...html.matchAll(/data-kj3-chapter=/g)];
  assert.equal(chapters.length, 6);
  for (const hook of ["data-kj3-menu-open", "data-kj3-current", "data-kj3-progress", "data-kj3-prev", "data-kj3-next"]) {
    assert.ok(html.includes(hook), `missing branch hook: ${hook}`);
  }
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(javascript, /touchend/);
  assert.match(javascript, /event\.key==="Escape"/);
  assert.match(javascript, /scrollIntoView/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(html, /aria-live="polite"/);
});
