import assert from "node:assert/strict";
import test from "node:test";

import {
  HELD_EVIDENCE_OUTCOME,
  heldEvidenceAuditRecord,
  heldObjectKey,
  heldStateKey,
  heldTerminalKey,
  holdUncertainEvidence,
  reprocessHeldEvidence,
} from "../src/line-held-evidence-lane.mjs";

function memoryR2() {
  const store = new Map();
  let sequence = 0;
  return {
    async put(key, value, options = {}) {
      const current = store.get(key);
      const condition = options.onlyIf || null;
      if (condition?.etagDoesNotMatch === "*" && current) return null;
      if (condition?.etagMatches && current?.etag !== condition.etagMatches) return null;
      const etag = `etag-${++sequence}`;
      store.set(key, { value, options, etag });
      return { key, etag };
    },
    async get(key) {
      const found = store.get(key);
      if (!found) return null;
      return {
        etag: found.etag,
        async text() { return typeof found.value === "string" ? found.value : new TextDecoder().decode(found.value); },
        async arrayBuffer() {
          if (typeof found.value === "string") return new TextEncoder().encode(found.value).buffer;
          return found.value instanceof ArrayBuffer ? found.value : new Uint8Array(found.value).buffer;
        },
      };
    },
    async delete(key) { store.delete(key); },
    async list({ prefix = "", limit = 1000 } = {}) {
      return { objects: [...store.keys()].filter((key) => key.startsWith(prefix)).slice(0, limit).map((key) => ({ key })), truncated: false };
    },
    store,
  };
}

function image(seed = 1) {
  return { body: new Uint8Array([seed, seed + 1]).buffer, mimeType: "image/png", extension: "png", byteSize: 2, sha256: String(seed).repeat(64).slice(0, 64) };
}

function heldInput(proofId = "line-held-1") {
  return {
    proofId,
    image: image(1),
    lineUserId: "U-private-line-id",
    messageId: "private-message-id",
    paymentContextText: "private customer text",
    sourceType: "user",
    sourceContext: "direct_user_visual_payment_gate",
    holdReason: "extractor_unavailable_or_failed",
    imageClass: "uncertain",
    userHash: "1".repeat(64),
    messageIdHash: "2".repeat(64),
  };
}

async function state(bucket, proofId) {
  const object = await bucket.get(heldStateKey(proofId));
  return object ? JSON.parse(await object.text()) : null;
}

test("held evidence is private evidence only and idempotent by proof id", async () => {
  const bucket = memoryR2();
  const input = heldInput("line-held-idempotent");
  const first = await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, input, { now: 1000 });
  const second = await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, input, { now: 2000 });
  assert.equal(first.held, true);
  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  const stored = await state(bucket, input.proofId);
  assert.equal(stored.observed_count, 2);
  assert.equal(stored.money_truth, "payments-worker");
  assert.equal(bucket.store.has(heldObjectKey(input.proofId, "png")), true);
});

test("accepted reprocess promotes through injected canonical gate exactly once under concurrent sweeps", async () => {
  const bucket = memoryR2();
  const proofId = "line-held-promote";
  await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, heldInput(proofId), { now: 1000 });
  let promotions = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const options = {
    now: 2_000_000,
    analyze: async () => ({ accepted: true, classification: { gate: "accept", reason: "payment_ref_and_amount" } }),
    promote: async () => { promotions += 1; await gate; return { captured: true }; },
  };
  const a = reprocessHeldEvidence({ LINE_SLIP_EVIDENCE: bucket }, options);
  const b = reprocessHeldEvidence({ LINE_SLIP_EVIDENCE: bucket }, options);
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  const results = await Promise.all([a, b]);
  assert.equal(promotions, 1);
  assert.equal(results.reduce((sum, result) => sum + result.promoted, 0), 1);
  assert.equal(bucket.store.has(heldStateKey(proofId)), false);
  const terminalObject = await bucket.get(heldTerminalKey(proofId));
  const terminal = JSON.parse(await terminalObject.text());
  assert.equal(terminal.outcome, HELD_EVIDENCE_OUTCOME.PROMOTED);
});

test("terminal held candidate cannot be reopened by duplicate webhook", async () => {
  const bucket = memoryR2();
  const proofId = "line-held-terminal-dedupe";
  const input = heldInput(proofId);
  await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, input, { now: 1000 });
  await reprocessHeldEvidence({ LINE_SLIP_EVIDENCE: bucket, LINE_HELD_EVIDENCE_MAX_ATTEMPTS: "1" }, {
    now: 2_000_000,
    analyze: async () => ({ accepted: false, classification: { gate: "hold", reason: "insufficient_transaction_evidence" } }),
    promote: async () => { throw new Error("must_not_promote"); },
  });
  const replay = await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, input, { now: 3_000_000 });
  assert.equal(replay.terminal, true);
  assert.equal(replay.deduped, true);
  assert.equal(bucket.store.has(heldStateKey(proofId)), false);
});

test("reject closes held candidate without promotion", async () => {
  const bucket = memoryR2();
  const proofId = "line-held-reject";
  await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, heldInput(proofId), { now: 1000 });
  let promotions = 0;
  const result = await reprocessHeldEvidence({ LINE_SLIP_EVIDENCE: bucket }, {
    now: 2_000_000,
    analyze: async () => ({ accepted: false, classification: { gate: "reject", reason: "no_transaction_evidence_detected" } }),
    promote: async () => { promotions += 1; return { captured: true }; },
  });
  assert.equal(result.rejected, 1);
  assert.equal(promotions, 0);
  const terminal = JSON.parse(await (await bucket.get(heldTerminalKey(proofId))).text());
  assert.equal(terminal.outcome, HELD_EVIDENCE_OUTCOME.REJECTED);
});

test("uncertain evidence exhausts to review_required and bounded notice hook", async () => {
  const bucket = memoryR2();
  const proofId = "line-held-review";
  await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, heldInput(proofId), { now: 1000 });
  let notices = 0;
  const result = await reprocessHeldEvidence({ LINE_SLIP_EVIDENCE: bucket, LINE_HELD_EVIDENCE_MAX_ATTEMPTS: "1" }, {
    now: 2_000_000,
    analyze: async () => ({ accepted: false, classification: { gate: "hold", reason: "extractor_unavailable_or_failed" } }),
    promote: async () => ({ captured: false }),
    notifyReviewRequired: async ({ audit }) => { notices += 1; assert.equal(audit.proof_id, proofId); },
  });
  assert.equal(result.review_required, 1);
  assert.equal(notices, 1);
  assert.equal(bucket.store.has(heldObjectKey(proofId, "png")), false);
});

test("retention expiry deletes raw bytes without analysis or promotion", async () => {
  const bucket = memoryR2();
  const proofId = "line-held-expire";
  await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket, LINE_HELD_EVIDENCE_RETENTION_HOURS: "1" }, heldInput(proofId), { now: 1000 });
  const result = await reprocessHeldEvidence({ LINE_SLIP_EVIDENCE: bucket, LINE_HELD_EVIDENCE_RETENTION_HOURS: "1" }, {
    now: 1000 + 2 * 3_600_000,
    analyze: async () => { throw new Error("expired_must_not_analyze"); },
    promote: async () => { throw new Error("expired_must_not_promote"); },
  });
  assert.equal(result.expired, 1);
  assert.equal(bucket.store.has(heldObjectKey(proofId, "png")), false);
});

test("audit projection omits private LINE identity and customer text", async () => {
  const bucket = memoryR2();
  const proofId = "line-held-audit";
  await holdUncertainEvidence({ LINE_SLIP_EVIDENCE: bucket }, heldInput(proofId), { now: 1000 });
  const stored = await state(bucket, proofId);
  const audit = JSON.stringify(heldEvidenceAuditRecord(stored));
  assert.equal(audit.includes("U-private-line-id"), false);
  assert.equal(audit.includes("private customer text"), false);
  assert.match(audit, /"money_truth":"payments-worker"/);
  assert.equal(stored.private.line_user_id, "U-private-line-id");
});
