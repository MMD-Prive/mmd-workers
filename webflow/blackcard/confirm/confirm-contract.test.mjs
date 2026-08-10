import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("./confirm.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./confirm.css", import.meta.url), "utf8");
const script = source
  .replace(/^<script>\s*/, "")
  .replace(/\s*<\/script>\s*$/, "");

function helperSource(name) {
  const match = source.match(new RegExp("^\\s*function " + name + "\\([^\\n]+$", "m"));
  assert.ok(match, "missing helper " + name);
  return match[0].trim();
}

test("Webflow handoff JavaScript compiles", () => {
  assert.doesNotThrow(() => new Script(script));
});

test("request body uses canonical t and fails closed without it", () => {
  assert.match(source, /\bcurrent_companion:[^,\n]+,t:correlation\(\),source_route:/);
  assert.doesNotMatch(source, /\btoken\s*:/);
  assert.match(source, /function validate\(\)[^\n]+if\(!correlation\(\)\)return fail/);
  assert.match(source, /function send\(\)[^\n]+if\(!correlation\(\)\)return show/);
  assert.match(source, /function draftStorageKey\(\)\{var raw=correlation\(\);if\(!raw\)return"";/);
});

test("success overlay remains scrollable on short screens", () => {
  assert.match(css, /\.bc-success\{[^\n}]*overflow-y:auto[^\n}]*overscroll-behavior:contain/);
  assert.match(css, /\.bc-success\{[^\n}]*place-items:stretch[^\n}]*align-content:start/);
});

test("success requires the exact 202 pending_review contract", () => {
  const helpers = [
    helperSource("isOpaque"),
    helperSource("isServerTimestamp"),
    helperSource("isAcceptedResponse"),
  ].join("\n");
  const accepts = runInNewContext(
    "(function(){" + helpers + ";return isAcceptedResponse;})()",
  );
  const valid = {
    ok: true,
    status: "pending_review",
    request_id: "req_123",
    submitted_at: "2026-08-10T00:00:00.000Z",
  };

  assert.equal(accepts(202, valid), true);
  assert.equal(accepts(200, valid), false);
  assert.equal(accepts(204, valid), false);
  assert.equal(accepts(202, { ...valid, ok: false }), false);
  assert.equal(accepts(202, { ...valid, status: "accepted" }), false);
  assert.equal(accepts(202, { ...valid, request_id: "" }), false);
  assert.equal(accepts(202, { ...valid, submitted_at: "not-a-date" }), false);
});

test("draft clearing remains downstream of strict acceptance", () => {
  const strictCheck = source.indexOf("isAcceptedResponse(res.status,data)");
  const clearAfterAcceptance = source.indexOf(".then(function(){clearDraft()", strictCheck);
  assert.ok(strictCheck >= 0, "strict response check is missing");
  assert.ok(clearAfterAcceptance > strictCheck, "draft clears before strict acceptance");
});
