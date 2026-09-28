import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("./profiles-r2-catalog.js", import.meta.url), "utf8");

test("Private Preview CTA hands off directly to the MY MMD viewer", () => {
  assert.match(
    catalog,
    /teaser\.href\s*=\s*"\/my-mmd\/private-preview\?from=profiles&model="\s*\+\s*encodeURIComponent\(item\.slug\)/,
  );
  assert.doesNotMatch(catalog, /\/member\/dashboard\?from=profiles&intent=private_teaser/);
});

test("Private Preview CTA passes only the public display slug", () => {
  assert.match(catalog, /encodeURIComponent\(item\.slug\)/);
  assert.doesNotMatch(catalog, /private_teaser[^\n]{0,120}(model_id|record_id|airtable)/i);
});
