import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

import worker from "../src/index.js";

// Regression: the page script lives inside a JS template literal, so a regex
// written as /^\d{4}/ lost its backslashes and every membership date rendered
// as INVALID. These tests run the RENDERED safeDate, not a stub.
async function renderedHtml() {
  const env = { LINE_LIFF_ID: "2000000000-AbCdEfGh", LIFF_SESSION_SECRET: "x", AIRTABLE_API_KEY: "x" };
  return (await worker.fetch(new Request("https://mmdbkk.com/member/liff"), env)).text();
}

describe("rendered safeDate in /member/liff shell", () => {
  it("accepts only YYYY-MM-DD", async () => {
    const html = await renderedHtml();
    const m = html.match(/function safeDate\(value\) \{[^\n]*\}/);
    assert.ok(m, "safeDate not found in rendered shell");
    const safeDate = runInNewContext(`(${m[0].replace("function safeDate", "function")})`);
    assert.equal(safeDate("2029-01-29"), "2029-01-29");
    for (const bad of ["", null, undefined, "dddd-dd-dd", "2029-1-29", "29-01-2029", "2029-01-29T16:59:59.999Z"]) {
      assert.equal(safeDate(bad), "", String(bad));
    }
  });

  it("source has no single-backslash regex escapes inside the template literal", () => {
    const src = readFileSync(new URL("../src/liff-member-shell.js", import.meta.url), "utf8");
    const start = src.indexOf("return `<!doctype html>");
    const end = src.indexOf("</html>", start);
    assert.ok(start > 0 && end > start);
    const region = src.slice(start, end);
    const bad = [...region.matchAll(/(?<!\\)\\[dDsSwWbB]/g)];
    assert.equal(bad.length, 0, "single-backslash escape found; double it (\\\\d) inside the template literal");
  });
});
