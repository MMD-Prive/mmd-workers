import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./kenji-board-v70-gate.js", import.meta.url), "utf8");
const snippet = await readFile(new URL("./kenji-board-v70-webflow-snippet.html", import.meta.url), "utf8");
const smoke = await readFile(new URL("./kenji-board-v70-smoke-test.js", import.meta.url), "utf8");
const runtime = await readFile(new URL("./kenji-board-v70-runtime.js", import.meta.url), "utf8");

test("V7 gate helper uses delegated click handling and fallback unlock API", () => {
  assert.match(source, /document\.addEventListener\("click"/);
  assert.match(source, /window\.mmdBoardV70UnlockGate = unlockGate/);
  assert.match(source, /typeof options === "string"/);
  assert.match(source, /window\.MMDGate/);
  assert.match(source, /requireMmdAuth/);
  assert.match(source, /data-v70-auth-check/);
});

test("V7 gate helper delegates auth to mmd-gate without secrets or writes", () => {
  assert.doesNotMatch(source, /MOCK_PASSPHRASE/);
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.doesNotMatch(source, /\bcustomFields\b/);
  assert.doesNotMatch(source, /\bcurrentMember\b/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /\bmethod\s*:\s*["']POST["']/i);
});

test("V7 runtime helper connects only to read-only runtime and exposes console API", () => {
  assert.match(runtime, /window\.mmdBoardV70LoadRuntime = loadRuntime/);
  assert.match(runtime, /window\.mmdBoardV70RuntimeUrl = runtimeUrl/);
  assert.match(runtime, /\/sigil\/board\/runtime/);
  assert.match(runtime, /fetch\(runtimeUrl\(\), \{/);
  assert.match(runtime, /method:\s*"GET"/);
  assert.match(runtime, /mmd:board-v70-gate-unlocked/);
  assert.doesNotMatch(runtime, /\bmethod\s*:\s*["']POST["']/i);
  assert.doesNotMatch(runtime, /XMLHttpRequest/i);
});

test("V7 runtime helper stays secret-free and does not write privileged state", () => {
  const forbidden = [
    /localStorage\.setItem/,
    /Airtable\s*token/i,
    /AIRTABLE_[A-Z0-9_]+/i,
    /admin[_ -]?key/i,
    /worker\s*secret/i,
    /wrangler\s+secret/i,
    /x-mmd-admin-secret/i,
    /Authorization/i,
    /sk-[A-Za-z0-9_-]+/i,
    /pat[A-Za-z0-9]{10,}/i,
    /payment\s*confirmed/i,
    /svip_eligible/i,
    /black\s*card\s*approved\s*automatically/i
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(runtime, pattern);
  }
});

test("V7 Webflow snippet includes required root, gate, and runtime selectors", () => {
  assert.match(snippet, /data-mmd-board-v70/);
  assert.match(snippet, /webflow\/mmd-gate\.js/);
  assert.match(snippet, /data-v70-auth-check/);
  assert.match(snippet, /data-v70-action="unlock-gate"/);
  assert.match(snippet, /data-v70-gate-status/);
  assert.match(snippet, /data-v70-runtime-status/);
  assert.match(snippet, /data-v70-runtime-meta/);
  assert.match(snippet, /data-v70-runtime-rules/);
  assert.match(snippet, /kenji-board-v70-gate\.js/);
  assert.match(snippet, /kenji-board-v70-runtime\.js/);
  assert.match(snippet, /kenji-board-v70-smoke-test\.js/);
});

test("V7 Webflow snippet keeps wrapper neutral so only unlock control matches gate action", () => {
  const classTokens = Array.from(snippet.matchAll(/class="([^"]*)"/g))
    .flatMap((match) => match[1].split(/\s+/).filter(Boolean));

  assert.match(snippet, /class="mmd-board-v70__gate-panel"/);
  assert.match(snippet, /data-v70-gate-panel/);
  assert.ok(!classTokens.includes("mmd-board-v70__gate"));
  assert.doesNotMatch(snippet, /data-mmd-board-v70-unlock/);
  assert.doesNotMatch(snippet, /data-mmd-board-v70-gate/);
  assert.doesNotMatch(snippet, /data-gate-action="unlock"/);
  assert.doesNotMatch(snippet, /data-v70-gate-passphrase/);

  const unlockActionMatches = snippet.match(/data-v70-action="unlock-gate"/g) || [];
  assert.equal(unlockActionMatches.length, 1);
  assert.match(snippet, /<button[^>]*data-v70-action="unlock-gate"[^>]*>/);
});

test("V7 Webflow snippet stays secret-free and read-only", () => {
  const forbidden = [
    /\bfetch\s*\(/i,
    /\bmethod\s*:\s*["']POST["']/i,
    /XMLHttpRequest/i,
    /Airtable\s*token/i,
    /AIRTABLE_[A-Z0-9_]+/i,
    /admin[_ -]?key/i,
    /worker\s*secret/i,
    /wrangler\s+secret/i,
    /sk-[A-Za-z0-9_-]+/i,
    /pat[A-Za-z0-9]{10,}/i
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(snippet, pattern);
  }
});

test("V7 smoke helper exposes console smoke API and checks required selectors", () => {
  assert.match(smoke, /window\.mmdBoardV70SmokeTest = runSmokeTest/);
  assert.match(smoke, /typeof window\.mmdBoardV70UnlockGate === "function"/);
  assert.match(smoke, /typeof window\.mmdBoardV70LoadRuntime === "function"/);
  assert.match(smoke, /window\.MMDGate/);
  assert.match(smoke, /window\.mmdBoardV70UnlockGate\(\{ redirect: false \}\)/);
  assert.doesNotMatch(smoke, /localStorage/);
  assert.match(smoke, /\[data-mmd-board-v70\]/);
  assert.match(smoke, /\[data-v70-auth-check\]/);
  assert.match(smoke, /\[data-v70-action=\\"unlock-gate\\"\]/);
  assert.match(smoke, /\[data-v70-gate-status\]/);
  assert.match(smoke, /\[data-v70-runtime-status\]/);
  assert.match(smoke, /\[data-v70-runtime-meta\]/);
  assert.match(smoke, /\[data-v70-runtime-rules\]/);
});

test("V7 smoke helper stays client-only and secret-free", () => {
  const forbidden = [
    /XMLHttpRequest/i,
    /\bmethod\s*:\s*["']POST["']/i,
    /Airtable\s*token/i,
    /AIRTABLE_[A-Z0-9_]+/i,
    /admin[_ -]?key/i,
    /worker\s*secret/i,
    /wrangler\s+secret/i,
    /sk-[A-Za-z0-9_-]+/i,
    /pat[A-Za-z0-9]{10,}/i
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(smoke, pattern);
  }
});
