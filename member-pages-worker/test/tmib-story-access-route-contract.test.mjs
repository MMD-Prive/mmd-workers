import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

test("member-pages routes TMIB before generic decorators", () => {
  assert.match(source, /handleTmibStoryAccess/);
  assert.match(source, /isTmibStoryAccessPath/);
  const tmib = source.indexOf("if (isTmibStoryAccessPath(url))");
  const canonical = source.indexOf("prepareMyMmdCanonicalEntitlementContext");
  assert.ok(tmib >= 0);
  assert.ok(canonical >= 0);
  assert.ok(tmib < canonical);
});
