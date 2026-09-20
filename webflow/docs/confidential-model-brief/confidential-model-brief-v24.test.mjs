import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const path = new URL("./confidential-model-brief-v24.html", import.meta.url);
const html = fs.readFileSync(path, "utf8");

test("confidential brief exposes TH EN ZH from one runtime", () => {
  assert.match(html, /data-lang="th"/);
  assert.match(html, /data-lang="en"/);
  assert.match(html, /data-lang="zh"/);
  assert.match(html, /const COPY = \{/);
  assert.match(html, /\bth:\s*\{/);
  assert.match(html, /\ben:\s*\{/);
  assert.match(html, /\bzh:\s*\{/);
  assert.match(html, /searchParams\.set\("lang",lang\)/);
});

test("mobile typography keeps explicit readable colors", () => {
  assert.match(html, /-webkit-text-fill-color:currentColor!important/);
  assert.match(html, /@media\(max-width:420px\)/);
  assert.match(html, /\.cmb24__hero h1\{font-size:46px;color:#fff9ed!important\}/);
  assert.match(html, /\.cmb24__accordion summary,.cmb24__accordion summary b\{color:#211d17!important\}/);
  assert.match(html, /"Noto Sans SC"/);
});

test("page stays compact with progressive disclosure", () => {
  const detailCount = (html.match(/<details data-reveal>/g) || []).length;
  assert.equal(detailCount, 5);
  assert.match(html, /OPEN ONLY WHAT YOU NEED/);
  assert.match(html, /cmb24__plus/);
  assert.match(html, /other\.open=false/);
});

test("horizontal swipe is information-only, not an image carousel", () => {
  assert.match(html, /cmb24__layers/);
  assert.match(html, /scroll-snap-type:x mandatory/);
  assert.doesNotMatch(html, /\b(swiper|slick|splide|carousel)\b/i);
  assert.doesNotMatch(html, /cmb24__layer[\s\S]{0,220}<img/i);
  const imgCount = (html.match(/<img /g) || []).length;
  assert.equal(imgCount, 3);
});

test("core confidential brief information remains present", () => {
  const markers = [
    "PRIVATE CANDIDATE DOSSIER",
    "VIP / BLACK CARD",
    "SVIP",
    "CLIENT CONTEXT",
    "REQUEST TYPE",
    "90.8%",
    "72.2%",
    "35–39",
    "30–34",
    "40–44",
    "Client</div><span>→</span><div>MMD</div><span>→</span><div>Model",
    "/rules/private-model-work",
    "https://t.me/mmdapply",
    "Direct Work",
    "Consent Required",
  ];
  for (const marker of markers) {
    const escaped = marker.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    assert.match(html, new RegExp(escaped, "i"));
  }
});

test("privacy reference is presentation-only and session-scoped", () => {
  assert.match(html, /sessionStorage\.getItem/);
  assert.match(html, /crypto\.getRandomValues/);
  assert.match(html, /Presentation only\. Route access \/ token \/ revocation authority remains Worker-owned/);
});

test("Apple-like reveal respects reduced motion", () => {
  assert.match(html, /cubic-bezier\(\.22,1,.36,1\)/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /filter:blur\(8px\)/);
});


test("MMD identity copy stays human and multilingual", () => {
  assert.match(html, /MMD Privé เป็นใคร\?/);
  assert.match(html, /AI Worker หลัก 7 ตัว/);
  assert.match(html, /นกฮูก 1 ตัว/);
  assert.match(html, /AI อีกกว่า 30 ตัว/);
  assert.match(html, /Who is MMD Privé\?/);
  assert.match(html, /7 primary AI Workers/);
  assert.match(html, /MMD Privé 是什么？/);
  assert.match(html, /7 个主要 AI Worker/);
  assert.match(html, /data-i18n="detailsLead2"/);
});
