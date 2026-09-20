// Held / uncertain LINE evidence lane.
//
// An image the canonical classifier could not accept is NOT a Payment Proof and
// never becomes one by being held. It stays an evidence candidate in a private,
// bounded-retention quarantine prefix until one of three canonical outcomes:
//
//   accepted  -> promoted through the SAME extractor + classifier + correlation
//                gates as live intake, producing exactly one Payment Proof
//   rejected  -> discarded as non-payment evidence
//   review    -> terminal review_required for a human operator
//
// Hard boundaries:
//   - Money Truth stays in payments-worker. Nothing here marks anything paid.
//   - There is deliberately no operator "force paid" or manual-promote entry
//     point. Promotion is only ever the result of re-running the canonical
//     gates on the original bytes.
//   - Raw bytes stay in the private evidence bucket under a separate held
//     prefix. They are never logged, never notified, never publicly addressable.
//   - Reprocess inputs that identify a customer live only inside the private
//     state body. The audit/log/notification projection carries hashes only.

const SCHEMA = "line_held_payment_evidence_v1";
const TERMINAL_SCHEMA = "line_held_payment_evidence_terminal_v1";
const HELD_PREFIX = "line-ofc/held-evidence/";
const TERMINAL_PREFIX = "line-ofc/held-evidence-terminal/";
const DEFAULT_RETENTION_HOURS = 72;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_BACKOFF_MS = 15 * 60 * 1000;
const DEFAULT_MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REPROCESS_LIMIT = 10;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;

export const HELD_EVIDENCE_OUTCOME = Object.freeze({
  PROMOTED: "promoted_to_payment_proof",
  REJECTED: "rejected_non_payment",
  REVIEW_REQUIRED: "review_required_uncertain_evidence",
  EXPIRED: "retention_expired_unresolved",
  MISSING: "held_evidence_missing",
});

function text(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function safeCode(value, max = 120) {
  return text(value, max).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, max);
}

function positiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return max ? Math.min(Math.floor(n), max) : Math.floor(n);
}

function safeProofId(value) {
  const id = text(value, 120);
  return /^[A-Za-z0-9_.:-]{4,120}$/.test(id) ? id : "";
}

export function heldRetentionMs(env = {}) {
  return positiveInt(env.LINE_HELD_EVIDENCE_RETENTION_HOURS, DEFAULT_RETENTION_HOURS, 168) * 3600000;
}

export function heldMaxAttempts(env = {}) {
  return positiveInt(env.LINE_HELD_EVIDENCE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 20);
}

export function heldLeaseMs(env = {}) {
  return positiveInt(env.LINE_HELD_EVIDENCE_LEASE_SECONDS, DEFAULT_LEASE_MS / 1000, 900) * 1000;
}

export function heldBackoffMs(attempts = 1, env = {}) {
  const base = positiveInt(env.LINE_HELD_EVIDENCE_BASE_BACKOFF_MINUTES, DEFAULT_BASE_BACKOFF_MS / 60000, 720) * 60000;
  const exponent = Math.max(0, Math.min(Number(attempts) || 1, 12) - 1);
  return Math.min(DEFAULT_MAX_BACKOFF_MS, base * 2 ** exponent);
}

export function heldStateKey(proofId = "") {
  return `${HELD_PREFIX}${safeProofId(proofId)}/state.json`;
}

export function heldObjectKey(proofId = "", extension = "bin") {
  return `${HELD_PREFIX}${safeProofId(proofId)}/original.${safeCode(extension, 8) || "bin"}`;
}

export function heldTerminalKey(proofId = "") {
  return `${TERMINAL_PREFIX}${safeProofId(proofId)}.json`;
}

function bucketOf(env = {}) {
  const bucket = env?.LINE_SLIP_EVIDENCE;
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function") return null;
  return bucket;
}

async function readJsonEnvelope(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { value: parsed, etag: text(object.etag, 160) };
  } catch (_) {
    return null;
  }
}

async function readJson(bucket, key) {
  return (await readJsonEnvelope(bucket, key))?.value || null;
}

/**
 * The only projection of a held item that may leave the private bucket: logs,
 * Ops notifications and receipts. No raw image, no LINE identity, no customer
 * message text, no amount.
 */
export function heldEvidenceAuditRecord(state = {}) {
  return {
    schema: SCHEMA,
    proof_id: text(state.proof_id, 120),
    hold_reason: safeCode(state.hold_reason, 80),
    image_class: safeCode(state.image_class, 60),
    source_type: safeCode(state.source_type, 20),
    source_context: safeCode(state.source_context, 60),
    attempts: Number(state.attempts) || 0,
    observed_count: Number(state.observed_count) || 0,
    created_at_ms: Number(state.created_at_ms) || 0,
    evidence_sha256: text(state.evidence_sha256, 64),
    message_id_hash: text(state.message_id_hash, 64),
    user_hash: text(state.user_hash, 64),
    group_hash: text(state.group_hash, 64),
    byte_size: Number(state.byte_size) || 0,
    mime_type: safeCode(state.mime_type, 40),
    money_truth: "payments-worker",
    evidence_only: true,
  };
}

async function writeState(bucket, state, onlyIf = null) {
  const options = {
    httpMetadata: { contentType: "application/json" },
    customMetadata: {
      schema: SCHEMA,
      proof_id: text(state.proof_id, 120),
      source: "line_held_evidence",
      hold_reason: safeCode(state.hold_reason, 80),
      attempts: String(Number(state.attempts) || 0),
    },
  };
  if (onlyIf) options.onlyIf = onlyIf;
  const stored = await bucket.put(heldStateKey(state.proof_id), JSON.stringify(state), options);
  return { state, stored, etag: text(stored?.etag, 160) };
}

async function closeHeld(bucket, state, outcome, reason, nowMs) {
  const marker = {
    schema: TERMINAL_SCHEMA,
    proof_id: text(state.proof_id, 120),
    outcome: safeCode(outcome, 60),
    reason: safeCode(reason, 120),
    attempts: Number(state.attempts) || 0,
    hold_reason: safeCode(state.hold_reason, 80),
    image_class: safeCode(state.image_class, 60),
    created_at_ms: Number(state.created_at_ms) || nowMs,
    closed_at_ms: nowMs,
    money_truth: "payments-worker",
  };
  await bucket.put(heldTerminalKey(state.proof_id), JSON.stringify(marker), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { schema: TERMINAL_SCHEMA, proof_id: marker.proof_id, outcome: marker.outcome },
  });
  if (typeof bucket.delete === "function") {
    await bucket.delete(heldObjectKey(state.proof_id, state.extension));
    await bucket.delete(heldStateKey(state.proof_id));
  }
  return marker;
}

/**
 * Persist an uncertain image as an evidence candidate.
 *
 * Idempotent by proof id: a duplicate webhook or a re-observation of the same
 * LINE message increments observed_count instead of creating a second item.
 */
export async function holdUncertainEvidence(env = {}, input = {}, options = {}) {
  const bucket = bucketOf(env);
  const proofId = safeProofId(input.proofId);
  const nowMs = Number(options.now) || Date.now();
  if (!bucket) return { held: false, reason: "held_evidence_bucket_missing", proof_id: proofId };
  if (!proofId) return { held: false, reason: "held_evidence_proof_id_invalid" };
  if (!input?.image?.body) return { held: false, reason: "held_evidence_image_missing", proof_id: proofId };

  const terminal = await readJson(bucket, heldTerminalKey(proofId));
  if (terminal?.proof_id) {
    return { held: false, deduped: true, terminal: true, outcome: terminal.outcome, proof_id: proofId };
  }

  const existingEnvelope = await readJsonEnvelope(bucket, heldStateKey(proofId));
  const existing = existingEnvelope?.value || null;
  if (existing?.proof_id) {
    if (Number(existing.processing_until_ms) > nowMs) {
      return { held: true, deduped: true, proof_id: proofId, attempts: Number(existing.attempts) || 0, processing: true };
    }
    const updated = {
      ...existing,
      observed_count: (Number(existing.observed_count) || 1) + 1,
      updated_at_ms: nowMs,
    };
    const written = await writeState(bucket, updated, existingEnvelope?.etag ? { etagMatches: existingEnvelope.etag } : null);
    if (existingEnvelope?.etag && written.stored === null) {
      return { held: true, deduped: true, proof_id: proofId, attempts: Number(existing.attempts) || 0, concurrent: true };
    }
    return { held: true, deduped: true, proof_id: proofId, attempts: Number(updated.attempts) || 0 };
  }

  const state = {
    schema: SCHEMA,
    proof_id: proofId,
    created_at_ms: nowMs,
    updated_at_ms: nowMs,
    next_attempt_at_ms: nowMs + heldBackoffMs(1, env),
    attempts: 0,
    observed_count: 1,
    processing_until_ms: 0,
    hold_reason: safeCode(input.holdReason || input.reason, 80) || "uncertain_payment_image",
    image_class: safeCode(input.imageClass, 60) || "uncertain",
    source_type: safeCode(input.sourceType, 20),
    source_context: safeCode(input.sourceContext, 60),
    message_id_hash: text(input.messageIdHash, 64),
    webhook_event_id_hash: text(input.webhookEventIdHash, 64),
    user_hash: text(input.userHash, 64),
    group_hash: text(input.groupHash, 64),
    evidence_sha256: text(input.image?.sha256, 64),
    mime_type: safeCode(input.image?.mimeType, 40),
    extension: safeCode(input.image?.extension, 8) || "bin",
    byte_size: Number(input.image?.byteSize) || 0,
    // Private reprocess inputs. These stay inside the private evidence bucket
    // and are excluded from heldEvidenceAuditRecord(), logs and notifications.
    private: {
      line_user_id: text(input.lineUserId, 100),
      message_id: text(input.messageId, 120),
      context_text: text(input.paymentContextText, 400),
    },
    evidence_only: true,
    money_truth: "payments-worker",
  };

  await bucket.put(heldObjectKey(proofId, state.extension), input.image.body, {
    httpMetadata: { contentType: input.image.mimeType || "application/octet-stream" },
    customMetadata: {
      schema: SCHEMA,
      proof_id: proofId,
      source: "line_held_evidence",
      evidence_sha256: state.evidence_sha256,
      hold_reason: state.hold_reason,
    },
  });
  const created = await writeState(bucket, state, { etagDoesNotMatch: "*" });
  if (created.stored === null) {
    return { held: true, deduped: true, proof_id: proofId, attempts: 0, concurrent: true };
  }
  return { held: true, deduped: false, proof_id: proofId, attempts: 0 };
}

async function loadHeldImage(bucket, state) {
  const object = await bucket.get(heldObjectKey(state.proof_id, state.extension));
  if (!object || typeof object.arrayBuffer !== "function") return null;
  const body = await object.arrayBuffer();
  if (!body || !body.byteLength) return null;
  return {
    body,
    mimeType: state.mime_type || "application/octet-stream",
    extension: state.extension || "bin",
    byteSize: body.byteLength,
    sha256: state.evidence_sha256 || "",
  };
}

/**
 * Bounded reprocess sweep.
 *
 * `analyze` and `promote` are injected so this lane cannot grow a second,
 * weaker classifier: production wires in the exact same
 * analyzeProductionPaymentProof() and accepted-evidence promotion path used by
 * live intake.
 */
export async function reprocessHeldEvidence(env = {}, options = {}) {
  const bucket = bucketOf(env);
  if (!bucket || typeof bucket.list !== "function") {
    return { scanned: 0, promoted: 0, rejected: 0, still_held: 0, review_required: 0, expired: 0, skipped: "held_lane_unavailable" };
  }
  const analyze = typeof options.analyze === "function" ? options.analyze : null;
  const promote = typeof options.promote === "function" ? options.promote : null;
  const notifyReviewRequired = typeof options.notifyReviewRequired === "function" ? options.notifyReviewRequired : null;
  if (!analyze || !promote) {
    return { scanned: 0, promoted: 0, rejected: 0, still_held: 0, review_required: 0, expired: 0, skipped: "held_lane_gates_not_wired" };
  }

  const nowMs = Number(options.now) || Date.now();
  const limit = positiveInt(options.limit, DEFAULT_REPROCESS_LIMIT, 50);
  const retentionMs = heldRetentionMs(env);
  const maxAttempts = heldMaxAttempts(env);
  const summary = { scanned: 0, processed: 0, promoted: 0, rejected: 0, still_held: 0, review_required: 0, expired: 0, missing: 0, collected: 0 };

  const listing = await bucket.list({ prefix: HELD_PREFIX, limit: Math.min(limit * 4, 200) });
  for (const entry of Array.isArray(listing?.objects) ? listing.objects : []) {
    if (summary.processed >= limit) break;
    const key = text(entry?.key, 300);
    if (!key.startsWith(HELD_PREFIX) || !key.endsWith("/state.json")) continue;
    const envelope = await readJsonEnvelope(bucket, key);
    let state = envelope?.value || null;
    summary.scanned += 1;
    if (!state?.proof_id) continue;
    if (Number(state.processing_until_ms) > nowMs) continue;
    if (Number(state.next_attempt_at_ms) > nowMs) continue;

    const claimed = { ...state, processing_until_ms: nowMs + heldLeaseMs(env), updated_at_ms: nowMs };
    const claim = await writeState(bucket, claimed, envelope?.etag ? { etagMatches: envelope.etag } : null);
    if (envelope?.etag && claim.stored === null) continue;
    state = claimed;
    const claimEtag = claim.etag || envelope?.etag || "";

    if (nowMs - (Number(state.created_at_ms) || nowMs) > retentionMs) {
      await closeHeld(bucket, state, HELD_EVIDENCE_OUTCOME.EXPIRED, "retention_window_elapsed", nowMs);
      summary.expired += 1;
      summary.processed += 1;
      continue;
    }

    const image = await loadHeldImage(bucket, state);
    if (!image) {
      await closeHeld(bucket, state, HELD_EVIDENCE_OUTCOME.MISSING, "held_object_unreadable", nowMs);
      summary.missing += 1;
      summary.processed += 1;
      continue;
    }

    summary.processed += 1;
    let analysis = null;
    try {
      analysis = await analyze({
        env,
        image,
        lineUserId: text(state.private?.line_user_id, 100),
        contextText: text(state.private?.context_text, 400),
      });
    } catch (_) {
      analysis = null;
    }

    const gate = safeCode(analysis?.classification?.gate, 20);
    if (analysis?.accepted === true) {
      let promotion = null;
      try {
        promotion = await promote({
          env,
          state,
          image,
          analysis,
          lineUserId: text(state.private?.line_user_id, 100),
          contextText: text(state.private?.context_text, 400),
        });
      } catch (_) {
        promotion = null;
      }
      if (promotion?.captured === true) {
        await closeHeld(bucket, state, HELD_EVIDENCE_OUTCOME.PROMOTED, safeCode(analysis?.classification?.reason, 120), nowMs);
        summary.promoted += 1;
        continue;
      }
      // Promotion failed downstream (Airtable/binding). Keep the candidate and
      // retry later. No Payment Proof and no money truth were created.
      const retryState = {
        ...state,
        attempts: (Number(state.attempts) || 0) + 1,
        updated_at_ms: nowMs,
        processing_until_ms: 0,
        next_attempt_at_ms: nowMs + heldBackoffMs((Number(state.attempts) || 0) + 1, env),
        last_error: "held_promotion_incomplete",
      };
      await writeState(bucket, retryState, claimEtag ? { etagMatches: claimEtag } : null);
      summary.still_held += 1;
      continue;
    }

    if (gate === "reject") {
      await closeHeld(bucket, state, HELD_EVIDENCE_OUTCOME.REJECTED, safeCode(analysis?.classification?.reason, 120), nowMs);
      summary.rejected += 1;
      continue;
    }

    const attempts = (Number(state.attempts) || 0) + 1;
    if (attempts >= maxAttempts) {
      const marker = await closeHeld(bucket, state, HELD_EVIDENCE_OUTCOME.REVIEW_REQUIRED, safeCode(analysis?.classification?.reason || state.hold_reason, 120), nowMs);
      summary.review_required += 1;
      if (notifyReviewRequired) {
        // Bounded, hash-only operator notice through the durable outbox.
        await notifyReviewRequired({ env, audit: heldEvidenceAuditRecord({ ...state, attempts }), marker }).catch(() => {});
      }
      continue;
    }

    const retryState = {
      ...state,
      attempts,
      updated_at_ms: nowMs,
      processing_until_ms: 0,
      next_attempt_at_ms: nowMs + heldBackoffMs(attempts, env),
      last_error: safeCode(analysis?.classification?.reason || "extractor_unavailable_or_failed", 120),
    };
    await writeState(bucket, retryState, claimEtag ? { etagMatches: claimEtag } : null);
    summary.still_held += 1;
  }

  if (typeof bucket.delete === "function") {
    const terminals = await bucket.list({ prefix: TERMINAL_PREFIX, limit: 200 });
    for (const entry of Array.isArray(terminals?.objects) ? terminals.objects : []) {
      const marker = await readJson(bucket, text(entry?.key, 300));
      if (!marker) continue;
      if (nowMs - (Number(marker.closed_at_ms) || 0) > retentionMs) {
        await bucket.delete(text(entry?.key, 300));
        summary.collected += 1;
      }
    }
  }

  return summary;
}

export const LINE_HELD_EVIDENCE_INTERNALS = Object.freeze({
  HELD_PREFIX,
  TERMINAL_PREFIX,
  SCHEMA,
  TERMINAL_SCHEMA,
  closeHeld,
  loadHeldImage,
  readJson,
  readJsonEnvelope,
  writeState,
});
