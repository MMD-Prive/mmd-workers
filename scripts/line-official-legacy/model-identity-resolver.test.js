const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeModelAlias, resolveModelAlias, resolveModelLabels } = require("./model-identity-resolver.js");

const TART = { id: "recKeywordTarT123", fields: { working_name: "TarT", folder_name: "TMIB-TART", model_key: "tart", search_aliases: "Tar T\nTart\nต้าร์\nตาร์ต", Model: ["recModelTarT12345"] } };
const OTHER = { id: "recKeywordOther12", fields: { working_name: "Taro", model_key: "taro", search_aliases: "ทาโร่", Model: ["recModelTaro123456"] } };

test("normalizes spacing, case and Thai tone marks", () => {
  assert.equal(normalizeModelAlias("Tar T"), "tart");
  assert.equal(normalizeModelAlias("TART"), "tart");
  assert.equal(normalizeModelAlias("ต้าร์"), "ตาร");
});

test("confirmed aliases resolve directly to the canonical model", () => {
  for (const label of ["Tart", "Tar T", "ต้าร์", "ตาร์ต"]) {
    const result = resolveModelAlias(label, [TART, OTHER]);
    assert.equal(result.status, "matched");
    assert.equal(result.model_id, "recModelTarT12345");
  }
});

test("close spelling is inferred only when one model is clearly best", () => {
  const result = resolveModelAlias("Tartt", [TART, OTHER]);
  assert.equal(result.status, "matched");
  assert.equal(result.model_id, "recModelTarT12345");
  assert.ok(result.confidence >= 0.92);
});

test("multi-model text links all models on one session only when every label resolves", () => {
  const catalog = [TART, { id: "recKeywordBabe123", fields: { working_name: "Babe B", search_aliases: "Babe", Model: ["recModelBabeB1234"] } }];
  const result = resolveModelLabels("Tar T + Babe B", catalog);
  assert.equal(result.status, "matched");
  assert.deepEqual(result.model_ids, ["recModelTarT12345", "recModelBabeB1234"]);
});
