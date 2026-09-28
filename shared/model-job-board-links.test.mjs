import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MODEL_JOB_BOARD_URL,
  buildModelJobBoardBroadcastLink,
  resolveModelJobBoardNext,
} from "./model-job-board-links.mjs";

test("board broadcast always enters LIFF Login V2", () => {
  const url = new URL(buildModelJobBoardBroadcastLink({ source: "line_model_group" }));
  assert.equal(url.origin, "https://www.mmdbkk.com");
  assert.equal(url.pathname, "/sigil/model/login");
  assert.equal(url.searchParams.get("intent"), "job_board");
  assert.equal(url.searchParams.get("return_to"), "public_job_board");
  assert.equal(url.searchParams.get("source"), "line_model_group");
  assert.equal(url.searchParams.get("next"), MODEL_JOB_BOARD_URL);
});

test("specific job preserves a safe detail destination", () => {
  const url = new URL(buildModelJobBoardBroadcastLink({ job_id: "JOB-20260928-001" }));
  assert.equal(url.searchParams.get("job_id"), "JOB-20260928-001");
  assert.equal(
    url.searchParams.get("next"),
    "https://sigil.mmdbkk.com/public/api/jobs/JOB-20260928-001",
  );
  assert.ok(!url.toString().startsWith(MODEL_JOB_BOARD_URL));
});

test("unsafe next destinations fail closed", () => {
  for (const next of [
    "https://evil.example/public/api/jobs",
    "https://sigil.mmdbkk.com/public/api/jobs/JOB-1/apply",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => resolveModelJobBoardNext({ next }), /job_board_next_invalid/);
  }
});
