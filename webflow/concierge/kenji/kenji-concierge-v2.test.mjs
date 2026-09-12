import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./kenji-concierge-v2.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./kenji-concierge-v2.css", import.meta.url), "utf8");
const javascript = readFileSync(new URL("./kenji-concierge-v2.js", import.meta.url), "utf8");

test("HTML keeps one scoped root and unique IDs", () => {
  assert.match(html, /id="kenji-concierge"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("member truth and customer routes remain canonical", () => {
  assert.match(html, /data-profile-endpoint="\/member\/api\/my-mmd\/profile"/);
  for (const route of ["/member/kenji-ai-20", "/member/my-mmd", "/booking", "/recovery"]) {
    assert.ok(html.includes(route), `missing route: ${route}`);
  }
});

test("visual contract protects high-contrast headings from Webflow globals", () => {
  assert.match(css, /#kenji-concierge :where\(h1,h2,h3,summary\)/);
  assert.match(css, /-webkit-text-fill-color:var\(--text\)!important/);
  assert.match(css, /--text:#fffaf0/);
  assert.match(css, /--gold:#ffbf4a/);
});

test("runtime parses and stays fail-closed", () => {
  const source = javascript.replace(/^<script>\s*/, "").replace(/\s*<\/script>\s*$/, "");
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /credentials:"include"/);
  assert.match(source, /data\.unauthenticated\?\{state:"guest"\}/);
  assert.doesNotMatch(source, /DEMO_ONLY|Math\.random|default.{0,12}points/i);
});

test("mobile-first interaction and accessibility hooks remain present", () => {
  assert.match(css, /scroll-snap-type:inline mandatory/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<details class="kc-disclosure">/);
});