import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/public-profiles-catalog.js", import.meta.url), "utf8");

test("public profile consent catalog is no-store so revocation is not served stale", () => {
  assert.match(source, /cache-control": "private, no-store, max-age=0, must-revalidate"/);
  assert.doesNotMatch(source, /stale-while-revalidate/);
});
