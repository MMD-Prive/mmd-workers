// The inbound review order is deliberate. This module prepares Per's review;
// the caller owns authorization, the durable LINE receipt and any reply.
const TRIGGERS = new Set(["JASPER", "NANO", "EMs01", "BOOK EI", "EMs11", "GWs19", "EMs19"]);

function entryOf(input = {}) {
  const raw = String(input.message_text || input.trigger || "").normalize("NFKC").trim();
  if (TRIGGERS.has(raw)) return { kind: "card_action_text", trigger: raw, query: raw };
  const explicit = /^(?:สนใจ|ขอดู|ถามเรื่อง|ชื่อ(?:\s*model|\s*นายแบบ)?\s*[:：-]?|model\s*[:：-]?)\s*(.{2,48})$/iu.exec(raw);
  const query = explicit?.[1]?.trim() || "";
  return query && query.length <= 48 ? { kind: "typed_model_name", trigger: "", query } : null;
}

function safeAddress(rename) {
  const first = String(rename || "").split(/\s+[-–—|]\s+/u)[0].trim();
  return /^(?:พี่|คุณ)\s*[\p{L}\p{M} .]{1,38}$/u.test(first) ? first : "";
}

export async function reviewMonthlyAdLead({ card_id = "", trigger = "", message_text = "", line_user_id = "" } = {}, readers = {}) {
  const log = [];
  const entry = entryOf({ trigger, message_text });
  if (!entry || !/^U[0-9a-f]{32}$/i.test(line_user_id) || (card_id && card_id !== "21829530")) {
    return { status: "out_of_scope", review_only: true, customer_reply: "" };
  }
  const modelReader = entry.kind === "card_action_text" ? "resolveClickedModel" : "resolveTypedModel";
  for (const method of ["resolveCustomer", "readVerifiedSpend", modelReader, "readReviewedHistory", "readOwnerRate"]) {
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
    const model = await readers[modelReader](entry.kind === "card_action_text"
      ? { card_id: "21829530", trigger: entry.trigger }
      : { query: entry.query, client_id: identity.client_id });
    log.push("reviewed_history");
    const history = await readers.readReviewedHistory(scope);
    log.push("owner_rate");
    const modelId = model?.status === "resolved" && model?.owner_approved === true &&
      /^rec[A-Za-z0-9]+$/.test(String(model?.canonical_model_id || "")) ? model.canonical_model_id : null;
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
      card_id: entry.kind === "card_action_text" ? "21829530" : null,
      trigger: entry.trigger || null,
      entry_kind: entry.kind,
      // LINE text actions and manually typed exact triggers are indistinguishable.
      attribution: "line_text_origin_unverified",
      client_id: identity.client_id,
      customer_status: identity.customer_status,
      address,
      verified_budget_per_job_thb: budget,
      canonical_model_id: modelId,
      reviewed_history_summary: history?.reviewed === true ? String(history.summary || "").slice(0, 300) : "",
      owner_rate_thb: rate?.owner_approved === true && rate?.client_id === identity.client_id &&
        rate?.model_id === modelId && Number.isFinite(Number(rate.customer_sell_rate_thb)) &&
        Number(rate.customer_sell_rate_thb) > 0
        ? Number(rate.customer_sell_rate_thb) : null,
      // Card 21829530 remains lead-only; a preset is context for Per, never an auto-quote.
      customer_reply: "",
      publish_authorized: false,
    };
  } catch (_) {
    return { status: "source_unavailable", review_only: true, customer_reply: "", steps: log };
  }
}
