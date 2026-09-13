const assert = require("node:assert/strict");
const test = require("node:test");

const {
  projectionWithBacklog,
  reviewedStagingIds,
  unqueuedSourceRows,
} = require("./client-lifecycle-reconciliation-v2.js");

const NOW = new Date("2026-09-13T07:00:00.000Z");
const CLIENT_ID = "recClient123456";

function staging(id) {
  return {
    id,
    fields: {
      line_tags_raw: "#client #purchased",
      review_status: "committed",
      decision: "link_existing_client",
      matched_client: [CLIENT_ID],
    },
  };
}

function review(id, stagingId, status = "materialized") {
  return {
    id,
    fields: {
      Client: [CLIENT_ID],
      "LINE OFC Import Row": [stagingId],
      review_status: status,
      materialization_status: status === "materialized" ? "materialized" : "",
    },
  };
}

test("reviewed staging ids are derived only from explicit review links", () => {
  const ids = reviewedStagingIds([review("r1", "s1"), review("r2", "s2")]);
  assert.deepEqual([...ids].sort(), ["s1", "s2"]);
});

test("unqueued client notes are counted as history backlog", () => {
  const rows = [staging("s1"), staging("s2")];
  const reviews = [review("r1", "s1")];
  assert.deepEqual(unqueuedSourceRows(rows, reviews).map((row) => row.id), ["s2"]);
});

test("projection keeps points in review-required while any #client note is unqueued", () => {
  const result = projectionWithBacklog({
    client: { id: CLIENT_ID, fields: { "Last Contacted": "2026-09-10" } },
    member: { id: "recMember123456", fields: { member_id: "M1", "Points Balance": 250, Clients: [CLIENT_ID] } },
    memberAmbiguous: false,
    stagingRows: [staging("s1"), staging("s2")],
    reviewRows: [review("r1", "s1")],
    sessionRows: [],
    paymentRows: [],
    intelligenceRows: [],
  }, NOW);

  assert.equal(result.projection.unqueued_history_note_count, 1);
  assert.equal(result.projection.unresolved_history_reviews, 1);
  assert.equal(result.projection.points_state, "review_required");
  assert.equal(result.fields.next_best_action, "Review historical LINE OFC evidence");
});

test("fully reviewed source notes can confirm member points snapshot", () => {
  const result = projectionWithBacklog({
    client: { id: CLIENT_ID, fields: { "Last Contacted": "2026-09-10" } },
    member: { id: "recMember123456", fields: { member_id: "M1", "Points Balance": 250, Clients: [CLIENT_ID] } },
    memberAmbiguous: false,
    stagingRows: [staging("s1")],
    reviewRows: [review("r1", "s1")],
    sessionRows: [],
    paymentRows: [],
    intelligenceRows: [],
  }, NOW);

  assert.equal(result.projection.unqueued_history_note_count, 0);
  assert.equal(result.projection.unresolved_history_reviews, 0);
  assert.equal(result.projection.points_state, "confirmed");
});
