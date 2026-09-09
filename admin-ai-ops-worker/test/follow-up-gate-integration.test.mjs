import assert from "node:assert/strict";
import test from "node:test";
import gate from "../src/gate.js";

function fakeNamespace(handler) {
  return {
    idFromName(name) { return `id:${name}`; },
    get() {
      return {
        fetch(input, init) {
          const request = input instanceof Request ? input : new Request(input, init);
          return handler(request);
        },
      };
    },
  };
}

test("Control Room context promotes due durable watches into Needs Per and Prepared", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, authenticated: true, actor: "per" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/v1/admin/dashboard") {
      return new Response(JSON.stringify({ ok: true, todos: [], boss: [], money: [], jobs: [], members: [], status: { admin: "พร้อม" } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const env = {
    FOLLOW_UP_AUTOPILOT: fakeNamespace(async (request) => {
      const url = new URL(request.url);
      assert.equal(url.pathname, "/__internal/follow-ups/state");
      return new Response(JSON.stringify({
        ok: true,
        autopilot_active: true,
        notification_channel: "command_center_only",
        counts: { active: 1, due: 1, snoozed: 0 },
        watches: [{
          id: "payment_waiting:pay-1",
          kind: "payment_waiting",
          state: "due",
          title: "Slip A",
          summary: "รอตรวจ",
          href: "/internal/admin/payments",
          due_at: "2026-09-07T10:00:00.000Z",
          last_checked_at: "2026-09-07T12:00:00.000Z",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  };

  try {
    const response = await gate.fetch(new Request(
      "https://mmdbkk.com/v1/admin/ai-ops/context?path=%2Finternal%2Fadmin%2Fcontrol-room",
      { headers: { cookie: "mmd_admin_gate_v1=test" } },
    ), env, {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-follow-up-autopilot"), "p1-live");
    const body = await response.json();
    assert.equal(body.command_center.watching.autopilot_active, true);
    assert.equal(body.command_center.counts.watching_due, 1);
    assert.equal(body.command_center.needs_per[0].id, "follow-up:payment_waiting:pay-1");
    assert.equal(body.command_center.prepared[0].execution_mode, "handoff_only");
    assert.equal(body.follow_up_autopilot.customer_messaging_enabled, undefined);
  } finally {
    globalThis.fetch = original;
  }
});

test("sync derives candidates only from verified dashboard and writes reminder state to the Durable Object", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/v1/admin/auth/me") {
      return new Response(JSON.stringify({ ok: true, authenticated: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/v1/admin/dashboard") {
      return new Response(JSON.stringify({
        ok: true,
        money: [{ id: "pay-2", status: "pending", due_at: "2026-09-07T12:00:00Z" }],
        jobs: [],
        members: [],
        todos: [],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected ${url.pathname}`);
  };

  let received = null;
  const env = {
    FOLLOW_UP_AUTOPILOT: fakeNamespace(async (request) => {
      const url = new URL(request.url);
      assert.equal(url.pathname, "/__internal/follow-ups/sync");
      received = await request.json();
      return new Response(JSON.stringify({
        ok: true,
        autopilot_active: true,
        counts: { active: 1, due: 1, snoozed: 0 },
        watches: received.candidates,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }),
  };

  try {
    const response = await gate.fetch(new Request("https://mmdbkk.com/v1/admin/ai-ops/follow-ups/sync", {
      method: "POST",
      headers: { cookie: "mmd_admin_gate_v1=test" },
    }), env, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(received.candidates.length, 1);
    assert.equal(received.candidates[0].id, "payment_waiting:pay-2");
    assert.equal(body.derivation.verified_source, "/v1/admin/dashboard");
    assert.equal(body.derivation.candidate_count, 1);
  } finally {
    globalThis.fetch = original;
  }
});
