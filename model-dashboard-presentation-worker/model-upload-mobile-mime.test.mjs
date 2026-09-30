import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./src/model-media-upload-presentation.js", import.meta.url), "utf8");

test("mobile Model media upload normalizes blank or image/jpg MIME from filename", () => {
  assert.match(source, /if\(type==='image\/jpg'\)type='image\/jpeg'/);
  assert.match(source, /jpg:'image\/jpeg'/);
  assert.match(source, /heic:'image\/heic'/);
  assert.match(source, /mov:'video\/quicktime'/);
  assert.match(source, /contentType\|\|normalizedMime\(item\.file\)/);
});

test("linked Job Board surface exposes canonical current-photo updater", async () => {
  const board = await readFile(new URL("../public-access-worker/src/public-job-board-v2.js", import.meta.url), "utf8");
  assert.match(board, /\/sigil\/model\/dashboard\/photos\?source=job_board&job_id=/);
  assert.match(board, /อัปเดตรูปปัจจุบัน/);
});
