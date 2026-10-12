import test from "node:test";
import assert from "node:assert/strict";
import { constantTimeEqual, formulaValue, httpError } from "./payment-primitives.js";

test("formulaValue escapes backslashes and single quotes, treats nullish as empty", () => {
  assert.equal(formulaValue("a'b\\c"), "a\\'b\\\\c");
  assert.equal(formulaValue(null), "");
  assert.equal(formulaValue(undefined), "");
  assert.equal(formulaValue(0), "");
});

test("httpError carries status and message", () => {
  const error = httpError(409, "conflict");
  assert.ok(error instanceof Error);
  assert.equal(error.status, 409);
  assert.equal(error.message, "conflict");
});

test("constantTimeEqual trims, compares exactly, and tolerates nullish", async () => {
  assert.equal(await constantTimeEqual(" secret ", "secret"), true);
  assert.equal(await constantTimeEqual("secret", "Secret"), false);
  assert.equal(await constantTimeEqual(null, undefined), true);
  assert.equal(await constantTimeEqual("a", ""), false);
});
