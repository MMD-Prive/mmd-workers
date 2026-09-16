import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

test("member-pages routes TMIB before generic decorators", () => {
  assert.match(source, /handleTmibStoryAccess/);
  assert.match(source, /isTmibStoryAccessPath/);
  assert.match(source, /handleTmibAct001Content/);
  const content = source.indexOf("if (isTmibAct001ContentPath(url))");
  const access = source.indexOf("if (isTmibStoryAccessPath(url))");
  const canonical = source.indexOf("const canonicalContext = await prepareMyMmdCanonicalEntitlementContext(request, env)");
  assert.ok(content >= 0);
  assert.ok(access >= 0);
  assert.ok(canonical >= 0);
  assert.ok(content < access);
  assert.ok(access < canonical);
});
