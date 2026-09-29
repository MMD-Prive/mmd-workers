// The inbound review order is deliberate. This module prepares Per's review;
// the caller owns authorization, the durable LINE receipt and any reply.
const TRIGGERS = new Set(["JASPER", "NANO", "EMs01", "BOOK EI", "EMs11", "GWs19", "TAH"]);

function safeAddress(rename) {
  const first = String(rename || "").split(/\s+[-–—|]\s+/u)[0].trim();
  return /^(?:พี่|คุณ)\s*[\p{L}\p{M} .]{1,38}$/u.test(first) ? first : "";
}

export async function reviewMonthlyAdLead({ card_id = "", trigger = "", line_user_id = "" } = {}, readers = {}) {
  const log = [];
  if (card_id !== "21829530" || !TRIGGERS.has(trigger) || !/^U[0-9a-f]{32}$/i.test(line_user_id)) {
    return { status: "out_of_scope", review_only: true, customer_reply: "" };
  }
  for (const method of ["resolveCustomer", "readVerifiedSpend", "resolveClickedModel", "readReviewedHistory", "readOwnerRate"]) {
    if (typeof readers[method] !== "function") return { status: "source_unavailable", review_only: true, customer_reply: "" };
  }
  try {
    log.push("identity");
    const identity = await readers.resolveCustomer(line_user_id);
    if (identity?.status !== "resolved" || identity?.status_verified !== true ||
        !["new_contact", "known_customer", "vip_relationship"].includes(identity?.customer_status) ||
        !/^rec[A-Za-z0-9]+$/.test(String(identity.client_id || ""))) {
      return { status: "identity_review_required", review_only: true, customer_reply: "", steps: log };
    }
    const address = safeAddress(identity.per_rename);
    const scope = { client_id: identity.client_id, line_user_id };
    log.push("verified_spend");
    const spend = await readers.readVerifiedSpend(scope);
    log.push("clicked_model");
    const model = await readers.resolveClickedModel({ card_id, trigger });
    log.push("reviewed_history");
    const history = await readers.readReviewedHistory(scope);
    log.push("owner_rate");
    const modelId = /^rec[A-Za-z0-9]+$/.test(String(model?.canonical_model_id || "")) ? model.canonical_model_id : null;
    const rate = modelId && spend?.verified === true && history?.reviewed === true
      ? await readers.readOwnerRate({ client_id: identity.client_id, model_id: modelId })
      : null;

    const budget = spend?.verified === true && Number.isFinite(Number(spend.per_job_thb)) && Number(spend.per_job_thb) >= 0
      ? Number(spend.per_job_thb) : null;
    const readyForPer = Boolean(modelId && budget !== null && history?.reviewed === true);
    return {
      status: readyForPer ? "owner_review_ready" : "evidence_review_required",
      review_only: true,
      steps: log,
      card_id,
      trigger,
      client_id: identity.client_id,
      customer_status: identity.customer_status,
      address,
      verified_budget_per_job_thb: budget,
      canonical_model_id: modelId,
      reviewed_history_summary: history?.reviewed === true ? String(history.summary || "").slice(0, 300) : "",
      owner_rate_thb: rate?.owner_approved === true && Number.isFinite(Number(rate.customer_sell_rate_thb))
        ? Number(rate.customer_sell_rate_thb) : null,
      // Card 21829530 remains lead-only; a preset is context for Per, never an auto-quote.
      customer_reply: "",
      publish_authorized: false,
    };
  } catch (_) {
    return { status: "source_unavailable", review_only: true, customer_reply: "", steps: log };
  }
}
