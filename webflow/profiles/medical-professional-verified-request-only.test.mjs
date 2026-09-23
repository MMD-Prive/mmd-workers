import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("./profiles-r2-catalog.js", import.meta.url), "utf8");
const booking = await readFile(new URL("../booking/booking-v4.html", import.meta.url), "utf8");
const admin = await readFile(new URL("../../admin-worker/src/public-model-application-review.js", import.meta.url), "utf8");
const taxonomy = await readFile(new URL("../../docs/architecture/PUBLIC_PROFILE_ROLE_TAXONOMY_V1.md", import.meta.url), "utf8");

test("Medical Professional is a verified request-only Profiles lane with no public price or checkout", () => {
  assert.match(catalog, /data-medical-request-only/);
  assert.match(catalog, /MMD VERIFIED · REQUEST ONLY/);
  assert.match(catalog, /role=medical_professional&brief=verified_request_only/);
  assert.match(catalog, /ยังไม่มีราคา การชำระเงิน การยืนยันคิว/);
  assert.doesNotMatch(catalog, /medical_professional&package=/);
});

test("Medical profile cards never open the generic booking flow", () => {
  assert.match(catalog, /var medicalRequestOnly = activeRole === "medical_professional"/);
  assert.match(catalog, /\/public\/access\?from=profiles&role=medical_professional&brief=verified_request_only/);
  assert.match(booking, /medicalRequestOnly = role === "medical_professional"/);
  assert.match(booking, /window\.location\.replace\("\/public\/access\?" \+ handoff\.toString\(\)\)/);
  assert.doesNotMatch(booking, /data-service="Medical Professional"/);
  assert.doesNotMatch(booking, /medical_professional:\s*\{/);
});

test("Medical Professional can only be saved as a brief-only verified public policy", () => {
  assert.match(admin, /medical_brief_only_required/);
  assert.match(admin, /medical_credential_verification_required/);
  assert.match(taxonomy, /credential status is exactly `verified` \*\*and\*\* `MMD Public Booking Mode` is exactly `brief_only`/);
  assert.match(taxonomy, /must not show a public price, checkout/);
});
