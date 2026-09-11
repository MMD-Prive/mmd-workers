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
  const { deriveCustomerIdentityAlignment, augmentClientIntelligenceWithIdentityAlignment } = await import(pathToFileURL(outfile).href);

  const clientId = "recABCDEFGHIJKLMN";
  const canonicalLine = `U${"a".repeat(26)}123456`;
  const mismatchLine = `U${"b".repeat(26)}654321`;
  let mismatch = false;

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
        identity_linked_at: "2026-09-11T08:00:00.000Z",
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

  const augmented = await augmentClientIntelligenceWithIdentityAlignment(
    Response.json({ ok: true, client_id: clientId, identity: { status: "canonical" } }),
    env,
    clientId,
  );
  const body = await augmented.json();
  assert.equal(augmented.headers.get("x-mmd-identity-alignment"), "read-only-v1");
  assert.equal(body.identity.alignment.status, "verified_match");
  assert.equal(JSON.stringify(body).includes(canonicalLine), false);

  mismatch = true;
  const conflict = await deriveCustomerIdentityAlignment(env, clientId);
  assert.equal(conflict.status, "mismatch");
  assert.equal(conflict.line_ofc.status, "mismatch");
  assert.equal(conflict.line_ofc.line_tail, "654321");
} finally {
  globalThis.fetch = originalFetch;
  await rm(tmp, { recursive: true, force: true });
}
