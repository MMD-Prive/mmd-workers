import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const board = await readFile(new URL("./kenji-admin-board-view-v1.js", import.meta.url), "utf8");

test("SIGIL Board is a query-driven view inside canonical Kenji admin", () => {
  assert.match(board, /searchParams\.get\("view"\)/);
  assert.match(board, /view === "board"/);
  assert.match(board, /searchParams\.set\("view", view\)/);
  assert.match(board, /data-kso-board-panel/);
  assert.match(board, /SIGIL Board/);
});

test("SIGIL Board reads only sanitized Worker board endpoints", () => {
  assert.match(board, /\/v1\/sigil\/board\/status/);
  assert.match(board, /\/v1\/sigil\/board\/queue\?limit=100/);
  assert.match(board, /credentials: "same-origin"/);
  assert.match(board, /mode !== "read_only"/);
  assert.doesNotMatch(board, /\/v1\/admin\/sigil\/board\/publish/);
  assert.doesNotMatch(board, /method:\s*["']POST["']/);
  assert.doesNotMatch(board, /api\.airtable\.com|AIRTABLE_API_KEY|Authorization:\s*["']Bearer/);
});

test("canonical Board view never fabricates fallback customer cases", () => {
  for (const forbidden of ["FALLBACK_CARDS", "fallback_payment", "fallback_svip", "fallback_black_card", "SVIP Review Candidate"]) {
    assert.doesNotMatch(board, new RegExp(forbidden));
  }
  assert.match(board, /ไม่มีข้อมูลจริงจาก Workerในตอนนี้|ไม่มีข้อมูลจริงจาก Worker ในตอนนี้/);
});

test("Board preserves authority boundaries and admin authentication handoff", () => {
  assert.match(board, /Money Truth/);
  assert.match(board, /Membership\/Access/);
  assert.match(board, /Private Model/);
  assert.match(board, /\/internal\/admin\/login\?next=/);
  assert.match(board, /location\.pathname \+ location\.search/);
});
