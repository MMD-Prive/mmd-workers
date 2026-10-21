import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeModelForBooking } from "./src/index.js";

const testIds = ["rec687cy5e8sx6yLI", "rec88tNFcOJwgrQVE", "recLTnhXwSlEpMuNv", "recXd0oo5QyXefB0W"];
const fields = { working_name: "TEST SIGIL MODEL", can_work_public: true, can_work_private: true, private_tier: "standard" };

test("all four verified test identities are excluded from Public, Private and booking discovery", () => {
  for (const id of testIds) {
    for (const scope of ["public", "private", "booking"]) {
      assert.equal(sanitizeModelForBooking({ id, fields }, { scope, privateAllowed: true, allowedFolders: ["standard"], env: {} }), null);
    }
  }
});

test("renaming a verified test identity does not bypass the exclusion", () => {
  for (const id of testIds) {
    assert.equal(sanitizeModelForBooking({ id, fields: { ...fields, working_name: "Example" } }, { scope: "public", privateAllowed: false, env: {} }), null);
  }
});

test("real record identities are not hidden by broad Test/name matching", () => {
  const id = "recRealModel000001";
  const model = sanitizeModelForBooking({ id, fields: { ...fields, working_name: "Testa" } }, { scope: "public", privateAllowed: false, env: {} });
  assert.equal(model.model_id, id);
  assert.equal(model.working_name, "Testa");
});
