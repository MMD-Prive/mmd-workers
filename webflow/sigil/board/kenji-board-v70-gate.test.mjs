import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./kenji-board-v70-gate.js", import.meta.url), "utf8");

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
