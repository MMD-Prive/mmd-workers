import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, "page.html"), "utf8");
const footer = fs.readFileSync(path.join(here, "footer.html"), "utf8");

function count(attr) {
  return [...page.matchAll(new RegExp(attr + '="[^"]*"', "g"))].length;
}

test("Companion page keeps TH/EN/ZH copy in parity", () => {
  const th = count("data-th");
  const en = count("data-en");
  const zh = count("data-zh");

  assert.equal(th, 71);
  assert.equal(en, th);
  assert.equal(zh, th);

  const translatedNodes = [...page.matchAll(/<[^>]*data-th="[^"]*"[^>]*>/g)].map(m => m[0]);
  assert.equal(translatedNodes.filter(node => !/\bdata-en="/.test(node)).length, 0);
  assert.equal(translatedNodes.filter(node => !/\bdata-zh="/.test(node)).length, 0);
});

test("Companion language controls expose all supported locales", () => {
  const langs = new Set([...page.matchAll(/data-lang="([^"]+)"/g)].map(m => m[1]));
  assert.deepEqual([...langs].sort(), ["en", "th", "zh"]);
});

test("Companion runtime gives ?lang priority over stored language", () => {
  const queryIndex = footer.indexOf("normalizeLang(sp.get('lang'))");
  const storageIndex = footer.indexOf("localStorage.getItem('mmd_lang')");
  assert.ok(queryIndex >= 0);
  assert.ok(storageIndex > queryIndex);
  assert.match(footer, /if\(!lang\)\{/);
});

test("Companion runtime normalizes EN/ZH/TH and keeps URL shareable", () => {
  assert.match(footer, /x==='zh'\|\|x\.startsWith\('zh-'\)\|\|x==='cn'/);
  assert.match(footer, /x==='en'\|\|x\.startsWith\('en-'\)/);
  assert.match(footer, /x==='th'\|\|x\.startsWith\('th-'\)/);
  assert.match(footer, /history\.replaceState/);
  assert.match(footer, /u\.searchParams\.set\('lang',l\)/);
  assert.match(footer, /document\.documentElement\.lang=htmlLang/);
  assert.match(footer, /aria-pressed/);
});

test("Companion runtime preserves canonical booking and continuity behavior", () => {
  for (const key of ["promo", "src", "campaign", "invite", "t"]) {
    assert.ok(footer.includes("'" + key + "'"));
  }
  assert.match(footer, /from','services_companion/);
  assert.match(footer, /service','companion/);
});
