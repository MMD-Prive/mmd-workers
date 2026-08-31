import fs from "node:fs";

function replaceAll(path, from, to, expectedMin = 1) {
  const before = fs.readFileSync(path, "utf8");
  const count = before.split(from).length - 1;
  if (count < expectedMin) throw new Error(`Expected at least ${expectedMin} matches in ${path}, found ${count}: ${from}`);
  fs.writeFileSync(path, before.split(from).join(to));
}

replaceAll(
  "member-pages-worker/src/liff-gateway-airtable.js",
  "const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 7000;",
  "const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 10000;",
);

replaceAll(
  "member-pages-worker/wrangler.toml",
  'AIRTABLE_REQUEST_TIMEOUT_MS = "7000"',
  'AIRTABLE_REQUEST_TIMEOUT_MS = "10000"',
  2,
);

replaceAll(
  "member-pages-worker/test/liff-gateway-airtable.test.mjs",
  'it("uses a bounded seven-second gateway timeout by default and clamps explicit overrides", () => {\n    assert.equal(liffGatewayAirtableTimeoutMs(env()), 7000);',
  'it("uses a bounded ten-second gateway timeout by default and clamps explicit overrides", () => {\n    assert.equal(liffGatewayAirtableTimeoutMs(env()), 10000);',
);
