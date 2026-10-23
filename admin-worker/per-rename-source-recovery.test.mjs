import test from "node:test";
import assert from "node:assert/strict";
import { enrichLineageWithPreSessionIndex } from "./src/pre-session-client-index.js";

const env = { AIRTABLE_API_KEY: "fixture", AIRTABLE_BASE_ID: "fixture" };
test("an authoritative Per Rename collision never falls through to historical matching", async () => {
  const input = Response.json({ ok: true, manual_fallback: true, per_rename_alias_ambiguous: true, records: [], results: [], items: [] });
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("must not read another source"); };
  try { assert.equal(await enrichLineageWithPreSessionIndex(request(), input, env), input); }
  finally { globalThis.fetch = original; }
});
const source = { id: "recSourceFixture", fields: {
  "Match Key": "per_source_v1:fixture:1", "Current LINE Rename": "ตั้ว 30 มค 68",
  "Match Status": "review_required_no_verified_identity", Snapshot: "2026-09-06",
} };
function fallback() {
  const old = [{ client_name: "ตั๋ว", client_id: "", confidence: 1, manual_public_only: true }];
  return new Response(JSON.stringify({ ok: true, records: old, results: old, items: old,
    no_canonical_match: true, manual_fallback: true,
    degraded_sources: ["manual_public_only_pending_reconcile"],
    lineage_warnings: ["manual_public_only_pending_reconcile"] }));
}
function request(strict = false) {
  return new Request("https://mmdbkk.com/v1/admin/clients/lineage-lookup", {
    method: "POST", body: JSON.stringify({ query: "ตั๋ว", canonical_only: strict }),
  });
}
for (const failedHistory of [false, true]) {
  test("source Per Rename is visible beyond index; history failure=" + failedHistory, async () => {
    const original = globalThis.fetch;
    const formulas = [];
    globalThis.fetch = async (input, init) => {
      assert.ok(!init.method || init.method === "GET");
      const url = new URL(input);
      const formula = url.searchParams.get("filterByFormula");
      if (formula) {
        assert.ok(!formula.includes("IFERROR("));
        formulas.push(formula);
      }
      if (url.pathname.endsWith("/tblkJST2MefkSZ43i")) {
        assert.deepEqual(url.searchParams.getAll("fields[]"), ["Match Key", "Current LINE Rename", "Match Status", "Snapshot"]);
        return Response.json({ records: [source] });
      }
      return Response.json({ records: [] }, { status: failedHistory && url.pathname.endsWith("/tblC98mKWbzmPuNzX") ? 503 : 200 });
    };
    try {
      const result = await (await enrichLineageWithPreSessionIndex(request(), fallback(), env)).json();
      assert.equal(result.results[0].remembered_name, source.fields["Current LINE Rename"]);
      assert.equal(result.results[0].matched_on, "per_rename");
      assert.equal(result.results[0].client_id, "");
      assert.equal(result.results[0].canonical, false);
      assert.equal(result.results[0].selectable, false);
      assert.equal(result.results[0].confidence, null);
      assert.deepEqual(result.results, result.records);
      assert.deepEqual(result.results, result.items);
      assert.equal(result.no_canonical_match, true);
      assert.equal(result.manual_fallback, false);
      assert.equal(result.degraded_sources.length, failedHistory ? 1 : 0);
      assert.ok(formulas.every(f => f.includes("FIND(")));
      const strict = await (await enrichLineageWithPreSessionIndex(request(true), fallback(), env)).json();
      assert.deepEqual(strict.results, []);
      assert.equal(strict.line_candidates[0].remembered_name, source.fields["Current LINE Rename"]);
    } finally { globalThis.fetch = original; }
  });
}
test("empty source response clears all stale result aliases without an outage warning", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ records: [] });
  try {
    const body = await (await enrichLineageWithPreSessionIndex(request(), fallback(), env)).json();
    assert.deepEqual(body.results, []);
    assert.deepEqual(body.records, []);
    assert.deepEqual(body.items, []);
    assert.deepEqual(body.degraded_sources, []);
    assert.equal(body.count, 0);
  } finally { globalThis.fetch = original; }
});
test("source evidence cannot introduce rejected rows or another account namespace", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => Response.json({ records: String(input).includes("tblkJST2MefkSZ43i") ? [
    { ...source, fields: { ...source.fields, "Match Key": "mms:fixture" } },
    { ...source, fields: { ...source.fields, "Match Status": "rejected" } },
  ] : [] });
  try {
    const body = await (await enrichLineageWithPreSessionIndex(request(), fallback(), env)).json();
    assert.deepEqual(body.results, []);
  } finally { globalThis.fetch = original; }
});
