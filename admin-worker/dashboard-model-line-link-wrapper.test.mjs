import assert from "node:assert/strict";
import test from "node:test";

import {
  augmentDashboardWithModelLineLinks,
  projectModelLineLinkSummary,
} from "./src/admin-dashboard-model-link-wrapper.js";

const MODEL_LINK_HREF = "/internal/admin/model-link";

test("dashboard Model LINE summary stays unavailable instead of inventing zero", () => {
  assert.deepEqual(projectModelLineLinkSummary({ ok: false, error: "unavailable" }), {
    available: false,
    waiting: null,
    conflicts: null,
    href: MODEL_LINK_HREF,
  });
});

test("dashboard Model LINE summary exposes counts only, not claim identity details", () => {
  const summary = projectModelLineLinkSummary({
    ok: true,
    count: 2,
    items: [
      { claim_id: "model_line_a", claim_status: "verified_unlinked", line_display_name: "Example A" },
      { claim_id: "model_line_b", claim_status: "conflict", line_display_name: "Example B" },
    ],
  });

  assert.deepEqual(summary, {
    available: true,
    waiting: 2,
    conflicts: 1,
    href: MODEL_LINK_HREF,
  });
  assert.equal(JSON.stringify(summary).includes("Example A"), false);
  assert.equal(JSON.stringify(summary).includes("claim_id"), false);
});

test("dashboard augmentation adds a bounded owner-review task without displacing existing priorities", () => {
  const payload = {
    ok: true,
    counts: { urgent: 1, payments: 1 },
    status: { admin: "พร้อม" },
    debug: {},
    focus: { title: "ยังไม่มีเรื่องด่วน", text: "none" },
    todos: [{ title: "ตรวจเงิน", href: "/internal/admin/payments" }],
  };
  const summary = { available: true, waiting: 3, conflicts: 1, href: MODEL_LINK_HREF };
  const result = augmentDashboardWithModelLineLinks(payload, summary);

  assert.equal(result.counts.model_line_links_pending, 3);
  assert.equal(result.counts.model_line_links_conflict, 1);
  assert.equal(result.status.model_line_links, "พร้อม");
  assert.equal(result.model_line_link.href, MODEL_LINK_HREF);
  assert.equal(result.todos.length, 2);
  assert.equal(result.todos[0].href, "/internal/admin/payments");
  assert.equal(result.todos[1].href, MODEL_LINK_HREF);
  assert.equal(result.focus.href, MODEL_LINK_HREF);
});

test("dashboard augmentation never exceeds four existing todos", () => {
  const payload = {
    ok: true,
    todos: [1, 2, 3, 4].map((n) => ({ title: String(n), href: "/task/" + n })),
    counts: {},
    status: {},
  };
  const result = augmentDashboardWithModelLineLinks(payload, {
    available: true,
    waiting: 5,
    conflicts: 0,
    href: MODEL_LINK_HREF,
  });
  assert.equal(result.todos.length, 4);
  assert.equal(result.todos.some((item) => item.href === MODEL_LINK_HREF), false);
});
