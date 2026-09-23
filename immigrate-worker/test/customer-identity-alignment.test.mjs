import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "customer-identity-alignment-"));
const outfile = join(tmp, "entry.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const originalFetch = globalThis.fetch;

try {
  await build({
    entryPoints: [join(workerRoot, "src/customer-identity-alignment.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const {
    VERIFIED_IDENTITY_READINESS_SCHEMA,
    deriveCustomerIdentityAlignment,
    deriveVerifiedIdentityReadiness,
    augmentClientIntelligenceWithIdentityAlignment,
  } = await import(pathToFileURL(outfile).href);

  const clientId = "recABCDEFGHIJKLMN";
  const canonicalLine = `U${"a".repeat(26)}123456`;
  const mismatchLine = `U${"b".repeat(26)}654321`;
  let mismatch = false;
  let identityLinkedAt = "2026-09-11T08:00:00.000Z";

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (table === "tblVv58TCbwh5j1fS") {
      return Response.json({ records: [{ id: clientId, fields: { line_user_id: canonicalLine } }] });
    }
    if (table === "tbl1u0foFBvgFpT9G") {
      return Response.json({ records: [{ id: "recOFC0000000001", fields: {
        line_user_id: mismatch ? mismatchLine : canonicalLine,
        matched_client_id: clientId,
        review_status: "committed",
        decision: "link_existing_client",
        match_type: "line_user_id_exact",
      } }] });
    }
    if (table === "tblXjQFwo0A2cHseh") {
      return Response.json({ records: [{ id: "recLIFF000000001", fields: {
        line_user_id: canonicalLine,
        Client: [clientId],
        ...(identityLinkedAt ? { identity_linked_at: identityLinkedAt } : {}),
      } }] });
    }
    if (table === "tbloDg9yx7ubS5QzW") {
      return Response.json({ records: [{ id: "recAUDIT00000001", fields: {
        line_user_id_tail: "123456",
        canonical_identity_status: "committed",
      } }] });
    }
    return new Response("not found", { status: 404 });
  };

  const env = { AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg" };
  const aligned = await deriveCustomerIdentityAlignment(env, clientId);
  assert.equal(aligned.status, "verified_match");
  assert.equal(aligned.canonical_client.line_tail, "123456");
  assert.equal(aligned.line_ofc.status, "matched");
  assert.equal(aligned.liff.status, "matched");
  assert.equal(aligned.grants_access, false);
  assert.equal(aligned.grants_membership, false);
  assert.equal(aligned.grants_points, false);
  assert.equal(JSON.stringify(aligned).includes(canonicalLine), false);

  const ownerReady = deriveVerifiedIdentityReadiness(false, aligned);
  assert.equal(ownerReady.schema, VERIFIED_IDENTITY_READINESS_SCHEMA);
  assert.equal(ownerReady.mode, "read_only");
  assert.equal(ownerReady.status, "ready_for_owner_verification");
  assert.equal(ownerReady.owner_review_ready, true);
  assert.equal(ownerReady.requires_owner_decision, true);
  assert.equal(ownerReady.kenji_continuity_ready, false);
  assert.equal(ownerReady.automatic_verification_allowed, false);
  assert.equal(ownerReady.identity_mutated, false);
  assert.deepEqual(ownerReady.blockers, ["owner_verification_status_required"]);

  const verified = deriveVerifiedIdentityReadiness(true, aligned);
  assert.equal(verified.status, "verified");
  assert.equal(verified.owner_review_ready, false);
  assert.equal(verified.requires_owner_decision, false);
  assert.equal(verified.kenji_continuity_ready, true);
  assert.deepEqual(verified.blockers, []);

  const reviewRequired = deriveVerifiedIdentityReadiness(false, {
    ...aligned,
    status: "review_required",
    line_ofc: { status: "missing", line_tail: null },
  });
  assert.equal(reviewRequired.status, "review_required");
  assert.deepEqual(reviewRequired.blockers, ["reviewed_line_ofc_required"]);

  const insufficient = deriveVerifiedIdentityReadiness(false, {
    ...aligned,
    status: "insufficient_evidence",
    canonical_client: { status: "missing", line_tail: null },
    line_ofc: { status: "missing", line_tail: null },
    liff: { status: "missing", line_tail: null },
  });
  assert.equal(insufficient.status, "insufficient_evidence");
  assert.deepEqual(insufficient.blockers, [
    "canonical_line_identity_required",
    "reviewed_line_ofc_required",
    "verified_liff_session_required",
  ]);

  const unavailable = deriveVerifiedIdentityReadiness(false, {
    ...aligned,
    status: "unavailable",
    canonical_client: { status: "missing", line_tail: null },
    line_ofc: { status: "missing", line_tail: null },
    liff: { status: "missing", line_tail: null },
  });
  assert.equal(unavailable.status, "unavailable");
  assert.deepEqual(unavailable.blockers, ["identity_evidence_unavailable"]);

  const inconsistentMatch = deriveVerifiedIdentityReadiness(true, {
    ...aligned,
    liff: { status: "missing", line_tail: null },
  });
  assert.equal(inconsistentMatch.status, "unavailable");
  assert.equal(inconsistentMatch.kenji_continuity_ready, false);

  identityLinkedAt = "";
  const unlinkedLiff = await deriveCustomerIdentityAlignment(env, clientId);
  assert.equal(unlinkedLiff.status, "review_required");
  assert.equal(unlinkedLiff.liff.status, "review_required");
  assert.equal(unlinkedLiff.basis.includes("verified_liff_session"), false);
  assert.equal(unlinkedLiff.basis.includes("liff_session_review_required"), true);
  const unlinkedReadiness = deriveVerifiedIdentityReadiness(true, unlinkedLiff);
  assert.equal(unlinkedReadiness.status, "review_required");
  assert.equal(unlinkedReadiness.kenji_continuity_ready, false);
  assert.deepEqual(unlinkedReadiness.blockers, ["verified_liff_session_required"]);
  identityLinkedAt = "2026-09-11T08:00:00.000Z";

  const augmented = await augmentClientIntelligenceWithIdentityAlignment(
    Response.json({ ok: true, client_id: clientId, identity: { status: "canonical" } }),
    env,
    clientId,
  );
  const body = await augmented.json();
  assert.equal(augmented.headers.get("x-mmd-identity-alignment"), "read-only-v1");
  assert.equal(augmented.headers.get("x-mmd-verified-identity-readiness"), "read-only-v1");
  assert.equal(body.identity.alignment.status, "verified_match");
  assert.equal(body.identity.readiness.status, "ready_for_owner_verification");
  assert.equal(body.identity.readiness.evidence.authoritative_verification_present, false);
  assert.equal(JSON.stringify(body).includes(canonicalLine), false);

  mismatch = true;
  const conflict = await deriveCustomerIdentityAlignment(env, clientId);
  assert.equal(conflict.status, "mismatch");
  assert.equal(conflict.line_ofc.status, "mismatch");
  assert.equal(conflict.line_ofc.line_tail, "654321");
  const blocked = deriveVerifiedIdentityReadiness(true, conflict);
  assert.equal(blocked.status, "conflict");
  assert.equal(blocked.kenji_continuity_ready, false);
  assert.deepEqual(blocked.blockers, ["identity_alignment_mismatch"]);
} finally {
  globalThis.fetch = originalFetch;
  await rm(tmp, { recursive: true, force: true });
}
