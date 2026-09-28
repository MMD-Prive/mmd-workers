import assert from "node:assert/strict";
import test from "node:test";

import {
  MY_MMD_FAST_TRUST_SCHEMA,
  fastTrustHasCanonicalClient,
  fastTrustLineFormula,
  fastTrustRenamedName,
  fastTrustSchemaFieldNames,
  resolveFastTrustAirtableSource,
} from "./my-mmd-fast-trust-source.mjs";

const LINE_ID = `U${"a".repeat(32)}`;

test("Fast Trust defaults to the canonical MMD LINE OFC staging schema", () => {
  const source = resolveFastTrustAirtableSource({});
  assert.deepEqual(source, {
    table: "MMD — LINE OFC Client Import Staging",
    lineUserIdField: "LINE User ID",
    renamedNameField: "Current LINE Rename",
    canonicalClientField: "Canonical Client",
  });
  assert.equal(
    fastTrustLineFormula(LINE_ID, source),
    `{LINE User ID}='${LINE_ID}'`,
  );
});

test("Fast Trust reads canonical rename and canonical Client link", () => {
  const source = resolveFastTrustAirtableSource({});
  const record = {
    fields: {
      "LINE User ID": LINE_ID,
      "Current LINE Rename": "สมาชิกทดสอบ - SVIP -",
      "Canonical Client": [{ id: "recCanonicalClient" }],
    },
  };
  assert.equal(fastTrustRenamedName(record, source), "สมาชิกทดสอบ - SVIP -");
  assert.equal(fastTrustHasCanonicalClient(record, source), true);
});

test("Fast Trust keeps explicit legacy compatibility isolated to an explicitly selected legacy table", () => {
  const source = resolveFastTrustAirtableSource({
    AIRTABLE_FAST_TRUST_LINE_OFC_STAGING_TABLE: MY_MMD_FAST_TRUST_SCHEMA.legacyTable,
  });
  assert.equal(source.lineUserIdField, "line_user_id");
  assert.equal(source.renamedNameField, "line_renamed_name");
  assert.equal(fastTrustRenamedName({ fields: { line_renamed_name: "Legacy VIP" } }, source), "Legacy VIP");
});

test("Fast Trust field overrides are bounded and malformed field names fail back to canon", () => {
  const fields = fastTrustSchemaFieldNames({
    AIRTABLE_FAST_TRUST_LINE_USER_ID_FIELD: "{bad}",
    AIRTABLE_FAST_TRUST_RENAMED_NAME_FIELD: "Current LINE Rename",
  });
  assert.equal(fields.lineUserIdField, "LINE User ID");
  assert.equal(fields.renamedNameField, "Current LINE Rename");
});

test("invalid LINE identity never produces an Airtable formula", () => {
  assert.equal(fastTrustLineFormula("not-a-line-id"), "");
});
