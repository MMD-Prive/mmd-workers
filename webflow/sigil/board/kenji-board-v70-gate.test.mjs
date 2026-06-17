import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./kenji-board-v70-gate.js", import.meta.url), "utf8");
const snippet = await readFile(new URL("./kenji-board-v70-webflow-snippet.html", import.meta.url), "utf8");
const smoke = await readFile(new URL("./kenji-board-v70-smoke-test.js", import.meta.url), "utf8");

test("V7 gate helper uses delegated click handling and fallback unlock API", () => {
  assert.match(source, /document\.addEventListener\("click"/);
  assert.match(source, /window\.mmdBoardV70UnlockGate = unlockGate/);
  assert.match(source, /typeof options === "string"/);
  assert.match(source, /mmd_board_v70_gate/);
  assert.match(source, /mmd_board_v70_role/);
  assert.match(source, /boss_per/);
});

test("V7 gate helper keeps the mock passphrase client-only", () => {
  assert.match(source, /MOCK_PASSPHRASE = "sigil"/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /\bmethod\s*:\s*["']POST["']/i);
});

test("V7 Webflow snippet includes required root and gate selectors", () => {
  assert.match(snippet, /data-mmd-board-v70/);
  assert.match(snippet, /data-v70-gate-passphrase/);
  assert.match(snippet, /data-v70-action="unlock-gate"/);
  assert.match(snippet, /data-v70-gate-status/);
  assert.match(snippet, /kenji-board-v70-gate\.js/);
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
  assert.match(smoke, /window\.mmdBoardV70UnlockGate\("sigil"\)/);
  assert.match(smoke, /localStorage\.getItem\(key\)/);
  assert.match(smoke, /mmd_board_v70_gate/);
  assert.match(smoke, /mmd_board_v70_role/);
  assert.match(smoke, /boss_per/);
  assert.match(smoke, /\[data-mmd-board-v70\]/);
  assert.match(smoke, /\[data-v70-gate-passphrase\]/);
  assert.match(smoke, /\[data-v70-action=\\"unlock-gate\\"\]/);
  assert.match(smoke, /\[data-v70-gate-status\]/);
});

test("V7 smoke helper stays client-only and secret-free", () => {
  const forbidden = [
    /\bfetch\s*\(/i,
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
