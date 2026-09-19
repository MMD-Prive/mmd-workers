const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/smoke" || request.method !== "POST") {
      return Response.json({ ok: false, error: "not_found" }, { status: 404, headers: JSON_HEADERS });
    }

    const expected = String(env.SMOKE_TOKEN || "").trim();
    const supplied = String(request.headers.get("authorization") || "").trim();
    if (!expected || supplied !== `Bearer ${expected}`) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404, headers: JSON_HEADERS });
    }

    const lineUserId = String(env.SMOKE_LINE_ID || "").trim();
    const telegramUserId = String(env.SMOKE_TELEGRAM_ID || "").trim();
    if (!/^U[0-9a-f]{32}$/i.test(lineUserId) || !/^\d{5,20}$/.test(telegramUserId)) {
      return Response.json({ ok: false, error: "synthetic_identity_config_invalid" }, { status: 500, headers: JSON_HEADERS });
    }

    const diagnostic = await callAdmin(env, "/__internal/hype/shop-orders/smoke", {
      headers: {
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "hype-shop-production-smoke",
      },
      body: { line_user_id: lineUserId },
    });

    const identityGate = await callAdmin(env, "/__internal/hype/shop-orders", {
      headers: {
        "x-mmd-service-binding": "telegram-worker",
      },
      body: { telegram_user_id: telegramUserId },
    });

    const checks = {
      admin_to_member_pages_binding: diagnostic.status === 200
        && diagnostic.body?.ok === true
        && diagnostic.body?.state === "pass",
      synthetic_line_has_no_owned_orders: diagnostic.body?.checks?.zero_owned_orders === true
        && diagnostic.body?.checks?.zero_candidates === true,
      projection_is_read_only: diagnostic.body?.checks?.read_only === true
        && diagnostic.body?.checks?.payment_mutation_blocked === true
        && diagnostic.body?.checks?.fulfillment_mutation_blocked === true
        && diagnostic.body?.checks?.refund_mutation_blocked === true,
      ownership_filter_active: diagnostic.body?.checks?.ownership_filtered_server_side === true,
      private_contact_fields_blocked: diagnostic.body?.checks?.address_not_exposed === true
        && diagnostic.body?.checks?.phone_not_exposed === true,
      unresolved_telegram_fails_closed: identityGate.status === 404
        && identityGate.body?.state === "connect_required"
        && identityGate.body?.error === "canonical_client_unresolved",
    };
    const ok = Object.values(checks).every(Boolean);

    return Response.json({
      ok,
      state: ok ? "pass" : "failed",
      checks,
      observations: {
        diagnostic_status: diagnostic.status,
        diagnostic_state: safeToken(diagnostic.body?.state),
        diagnostic_authority: safeText(diagnostic.body?.authority, 160),
        identity_gate_status: identityGate.status,
        identity_gate_state: safeToken(identityGate.body?.state),
        identity_gate_error: safeToken(identityGate.body?.error),
      },
      guardrails: {
        synthetic_only: true,
        customer_data_returned: false,
        business_truth_mutated: false,
        order_created: false,
        payment_changed: false,
        fulfillment_changed: false,
        complaint_created: false,
      },
    }, { status: ok ? 200 : 503, headers: JSON_HEADERS });
  },
};

async function callAdmin(env, path, options = {}) {
  if (!env.ADMIN_WORKER?.fetch) {
    return { status: 0, body: { ok: false, error: "admin_binding_missing" } };
  }
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(`https://admin-worker.internal${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
      body: JSON.stringify(options.body || {}),
    }));
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return { status: 0, body: { ok: false, error: "admin_binding_unavailable" } };
  }
}

function safeToken(value) {
  return safeText(value, 120).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || null;
}

function safeText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}
