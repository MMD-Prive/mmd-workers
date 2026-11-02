import assert from "node:assert/strict";
import {
  buildByYourRequestFields,
  countMonthlyPeople,
  enforceMonthlyQuota,
  monthKeyInBangkok,
  stableRequestId,
} from "./by-your-request.js";

assert.equal(monthKeyInBangkok("2026-03-31T17:00:00.000Z"), "2026-04", "Bangkok month boundary");
const base = { customer_identity: "client_1", month_key: "2026-04" };
const records = [
  { ...base, requested_person_key: "person_a" },
  { ...base, requested_person_key: "person_a", media_ref: "second-image" },
  { ...base, requested_person_key: "person_b" },
  { ...base, requested_person_key: "person_c" },
  { ...base, requested_person_key: "person_archival", archival_import: true },
];
assert.equal(countMonthlyPeople(records, "client_1", "2026-04"), 3, "media does not consume another person slot");
assert.equal(enforceMonthlyQuota({ existingRecords: records, customerIdentity: "client_1", requestedPersonKey: "person_a", at: "2026-04-02T00:00:00Z" }).allowed, true, "retry same person is idempotent");
assert.equal(enforceMonthlyQuota({ existingRecords: records, customerIdentity: "client_1", requestedPersonKey: "person_d", at: "2026-04-02T00:00:00Z" }).allowed, true);
assert.equal(enforceMonthlyQuota({ existingRecords: [...records, { ...base, requested_person_key: "person_d" }], customerIdentity: "client_1", requestedPersonKey: "person_e", at: "2026-04-02T00:00:00Z" }).allowed, false);
assert.equal(enforceMonthlyQuota({ existingRecords: records, customerIdentity: "client_1", requestedPersonKey: "person_e", archivalImport: true }).allowed, true, "archive does not consume current quota");
const idA = await stableRequestId({ source: "line", sourceId: "row-1", customerIdentity: "client_1", requestedPersonKey: "person_a" });
const idB = await stableRequestId({ source: "line", sourceId: "row-1", customerIdentity: "client_1", requestedPersonKey: "person_a" });
assert.equal(idA, idB, "stable source ID deduplicates retries");
const fields = buildByYourRequestFields({ source: "historical_line", sourceId: "row-1", customerIdentity: "client_1", requestedPersonKey: "unknown:row-1", inquiryText: "คุณเปอร์รู้จักไหม", identityUnknown: true, archivalImport: true, mediaStatus: "missing_original", socialLinks: ["https://instagram.com/example"], socialHandlesVerified: false });
assert.equal(fields["Media Status"], "missing_original");
assert.equal(fields["Social Handles Verified"], "no");
assert.equal(fields["No Automatic Identification"], "yes");
console.log("by-your-request contract tests passed");
