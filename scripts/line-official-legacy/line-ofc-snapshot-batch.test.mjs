import assert from "node:assert/strict";
import test from "node:test";

import { buildLineOfcSnapshotPayload, buildSnapshotBatch, stripMetaForImport } from "./line-ofc-snapshot-batch.mjs";

test("builds a LINE OFC snapshot payload with source hash and metadata", () => {
  const payload = buildLineOfcSnapshotPayload({
    line_user_id: "U123",
    current_line_rename: "คุณเอ็ม 2024-08-31",
    raw_line_notes: "LINE OFC note: MMD Confirmation PN Man 20,000",
    service_history_candidate: [{ date: "2024-08-31", model: "Man", amount: 20000 }],
    case_key: "client:em",
    source_priority: "line_ofc",
    snapshot_window: "2024-08-31",
  });

  assert.match(payload.import_id, /^line-ofc-snapshot:/);
  assert.equal(payload.line_user_id, "U123");
  assert.match(payload.source_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(payload._snapshot_meta.source_priority, "line_ofc");
  assert.equal(payload._snapshot_meta.case_key, "client:em");
  assert.match(payload.service_history_candidate, /20000/);
});

test("accepts owner-confirmed and customer-note source priorities", () => {
  for (const source_priority of ["owner_confirmed", "customer_note", "model_group_album"]) {
    const payload = buildLineOfcSnapshotPayload({
      line_user_id: "U123",
      raw_line_notes: "evidence",
      source_priority,
    });
    assert.equal(payload._snapshot_meta.source_priority, source_priority);
  }
});

test("requires real evidence text or candidate JSON", () => {
  assert.throws(() => buildLineOfcSnapshotPayload({ line_user_id: "U123" }), /snapshot_evidence_required/);
  assert.throws(() => buildLineOfcSnapshotPayload({ raw_line_notes: "evidence" }), /line_user_id_required/);
});

test("limits lightweight history evidence to at most two items per case", () => {
  const input = {
    snapshots: [
      { line_user_id: "U1", case_key: "case-a", raw_line_notes: "one" },
      { line_user_id: "U1", case_key: "case-a", raw_line_notes: "two" },
    ],
  };
  assert.equal(buildSnapshotBatch(input).length, 2);
  assert.throws(() => buildSnapshotBatch({ snapshots: [
    ...input.snapshots,
    { line_user_id: "U1", case_key: "case-a", raw_line_notes: "three" },
  ] }), /too_many_evidence_items_for_case:case-a/);
});

test("strips private helper metadata before import", () => {
  const payload = buildLineOfcSnapshotPayload({ line_user_id: "U123", raw_line_notes: "evidence" });
  const body = stripMetaForImport(payload);
  assert.equal(body._snapshot_meta, undefined);
  assert.equal(body.line_user_id, "U123");
});
