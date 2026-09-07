import assert from "node:assert/strict";
import test from "node:test";
import { AI_OPS_SURFACES, resolveAiOpsSurface } from "../src/ai-ops-layer-contract.js";

test("all configured AI Ops surfaces resolve canonical", () => {
  for (const [path, surface] of AI_OPS_SURFACES) {
    const result = resolveAiOpsSurface(path);
    assert.equal(result.canonical, true, path);
    assert.equal(result.surface, surface, path);
  }
});
