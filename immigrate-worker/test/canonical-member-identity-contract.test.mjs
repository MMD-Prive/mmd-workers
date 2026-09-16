import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workerRoot = new URL("..", import.meta.url);
const forbidden = ["member", "stack"].join("");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test("immigrate-worker runtime uses only canonical MMD member identity", () => {
  const roots = [
    new URL("../src", import.meta.url),
    new URL("../public", import.meta.url),
  ];
  const files = roots.flatMap((url) => walk(url.pathname));
  files.push(new URL("../wrangler.toml", import.meta.url).pathname);

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8").toLowerCase();
    assert.equal(source.includes(forbidden), false, file);
  }
});

test("renewal resolver declares canonical member_id Airtable fields", () => {
  const types = fs.readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
  const wrangler = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.ok(types.includes("AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD?: string"));
  assert.ok(types.includes("AIRTABLE_MEMBERS_MEMBER_ID_FIELD?: string"));
  assert.ok(wrangler.includes('AIRTABLE_ENTITLEMENT_MEMBER_ID_FIELD = "member_id"'));
  assert.ok(wrangler.includes('AIRTABLE_MEMBERS_MEMBER_ID_FIELD = "member_id"'));
});
