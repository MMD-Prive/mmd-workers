(() => {
  "use strict";

  const root = document.querySelector("[data-mmd-anniversary-control]");
  if (!root) return;

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));
  const state = { claim: null, session: null, busy: false };
  const el = {
    connection: $("[data-op-connection]"),
    checkSession: $("[data-op-check-session]"),
    sessionLabel: $("[data-campaign-session-label]"),
    actor: $("[data-campaign-actor]"),
    session: $("[data-campaign-session]"),
    claimId: $("[data-campaign-claim-id]"),
    load: $("[data-campaign-load]"),
    clear: $("[data-campaign-clear]"),
    status: $("[data-campaign-status]"),
    panel: $("[data-campaign-claim-panel]"),
    title: $("[data-campaign-title]"),
    summary: $("[data-campaign-summary]"),
    claimState: $("[data-campaign-state]"),
    facts: $("[data-campaign-facts]"),
    audit: $("[data-campaign-audit]"),
    reason: $("[data-campaign-reason]"),
    months: $("[data-campaign-months]"),
    paymentReference: $("[data-campaign-payment-ref]"),
    upgradeReference: $("[data-campaign-upgrade-ref]"),
    upgradeRequested: $("[data-campaign-upgrade]"),
    decisions: $$('[data-campaign-decision]'),
    apply: $("[data-campaign-apply]"),
    applyNote: $("[data-campaign-apply-note]"),
  };

  function text(node, value) {
    if (node) node.textContent = value == null || value === "" ? "-" : String(value);
  }

  function tone(node, value) {
    if (!node) return;
    node.classList.remove("is-ok", "is-warn", "is-bad");
    if (value) node.classList.add(`is-${value}`);
  }

  function setStatus(message, value = "warn") {
    text(el.status, message);
    tone(el.status, value);
  }

  function loginRedirect() {
    const next = `${location.pathname}${location.search}`;
    location.replace(`/internal/admin/login?next=${encodeURIComponent(next)}`);
  }

  async function jsonRequest(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { accept: "application/json", ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) loginRedirect();
    return { response, body };
  }

  async function checkSession() {
    const { response, body } = await jsonRequest("/v1/admin/auth/me");
    const session = body?.session;
    const actor = body?.actor;
    if (!response.ok || body?.authenticated !== true || !session?.id || !actor?.id) {
      state.session = null;
      text(el.sessionLabel, "Session required");
      text(el.actor, "actor unavailable");
      text(el.session, "signed session unavailable");
      tone(el.connection, "bad");
      text(el.connection?.querySelector("span"), "Locked");
      setControls();
      return false;
    }
    state.session = session;
    text(el.sessionLabel, "Signed session active");
    text(el.actor, `actor · ${actor.id}`);
    text(el.session, `session · ${session.id}`);
    tone(el.connection, "ok");
    text(el.connection?.querySelector("span"), "Authenticated");
    setStatus("Admin session verified. Load a claim to continue.", "ok");
    setControls();
    return true;
  }

  function claimId() {
    const value = String(el.claimId?.value || "").trim().toUpperCase();
    return /^MMD6-\d{4}-[A-Z0-9]{12}$/.test(value) ? value : "";
  }

  function fact(label, value) {
    const item = document.createElement("div");
    const caption = document.createElement("span");
    const strong = document.createElement("strong");
    caption.textContent = label;
    strong.textContent = value == null || value === "" ? "-" : String(value);
    item.append(caption, strong);
    return item;
  }

  function renderClaim(claim) {
    state.claim = claim || null;
    if (!claim) {
      if (el.panel) el.panel.hidden = true;
      setControls();
      return;
    }
    if (el.panel) el.panel.hidden = false;
    text(el.title, claim.claimId);
    text(el.summary, `${claim.status || "unknown"} · ${claim.membershipTier || "no tier"}`);
    text(el.claimState?.querySelector("span"), claim.claimStatus || "unknown");
    tone(el.claimState, claim.claimStatus === "benefit_applied" ? "ok" : claim.claimStatus === "rejected" ? "bad" : "warn");
    if (el.facts) {
      el.facts.replaceChildren(
        fact("Eligibility", claim.status),
        fact("Claim status", claim.claimStatus),
        fact("Payment", claim.paymentRequired ? (claim.paymentVerified ? "verified" : "required") : "not required"),
        fact("Tier snapshot", claim.membershipTier),
        fact("Approved months", claim.approvedMonths),
        fact("Points", claim.pointsAward),
        fact("Membership payment", claim.paymentReference),
        fact("Upgrade payment", claim.upgradePaymentReference),
        fact("New expiry", claim.newMembershipExpiry),
      );
    }
    if (el.months && claim.approvedMonths != null) el.months.value = String(claim.approvedMonths);
    if (el.paymentReference) el.paymentReference.value = claim.paymentReference || "";
    if (el.upgradeReference) el.upgradeReference.value = claim.upgradePaymentReference || "";
    if (el.upgradeRequested) el.upgradeRequested.checked = Boolean(claim.upgradeRequired);
    text(el.audit, JSON.stringify(claim.audits || [], null, 2));
    setControls();
  }

  function setControls() {
    const ready = Boolean(state.session && state.claim && !state.busy);
    const terminal = ["benefit_applied", "rejected"].includes(state.claim?.claimStatus);
    for (const button of el.decisions) button.disabled = !ready || terminal;
    const canApply = ["benefit_approved", "apply_partially_failed"].includes(state.claim?.claimStatus);
    if (el.apply) el.apply.disabled = !ready || !canApply;
    text(el.applyNote, canApply ? "Approval gate passed. Apply remains idempotent in the benefits worker." : "Claim must be approved before Apply.");
  }

  async function loadClaim() {
    const id = claimId();
    if (!id) {
      setStatus("Claim Reference ไม่ถูกต้องครับ", "bad");
      return;
    }
    state.busy = true;
    setControls();
    setStatus("Loading claim…", "warn");
    try {
      const { response, body } = await jsonRequest(`/v1/admin/campaigns/anniversary/claims/${encodeURIComponent(id)}`);
      if (!response.ok || !body?.claim) throw new Error(body?.error || "claim_load_failed");
      renderClaim(body.claim);
      setStatus("Claim loaded from promotion-worker.", "ok");
    } catch (error) {
      renderClaim(null);
      setStatus(`Load failed: ${error?.message || "unknown_error"}`, "bad");
    } finally {
      state.busy = false;
      setControls();
    }
  }

  function decisionBody(action) {
    const reason = String(el.reason?.value || "").trim();
    if (!reason) throw new Error("admin_reason_required");
    const body = { action, reason };
    if (action === "approve") {
      const rawMonths = String(el.months?.value || "").trim();
      if (rawMonths) body.approvedMonths = Number(rawMonths);
      body.paymentReference = String(el.paymentReference?.value || "").trim();
      body.upgradeRequested = Boolean(el.upgradeRequested?.checked);
      body.upgradePaymentReference = String(el.upgradeReference?.value || "").trim();
    }
    return body;
  }

  async function decide(action) {
    if (!state.claim) return;
    let body;
    try {
      body = decisionBody(action);
    } catch (error) {
      setStatus(error.message, "bad");
      return;
    }
    if (action === "reject" && !confirm("Reject this Care Back claim?")) return;
    state.busy = true;
    setControls();
    setStatus(`Submitting ${action}…`, "warn");
    try {
      const { response, body: result } = await jsonRequest(
        `/v1/admin/campaigns/anniversary/claims/${encodeURIComponent(state.claim.claimId)}/decision`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!response.ok || !result?.claim) throw new Error(result?.error || "decision_failed");
      renderClaim(result.claim);
      setStatus(`Decision saved: ${action}.`, "ok");
    } catch (error) {
      setStatus(`Decision failed: ${error?.message || "unknown_error"}`, "bad");
    } finally {
      state.busy = false;
      setControls();
    }
  }

  async function applyBenefits() {
    if (!state.claim) return;
    const reason = String(el.reason?.value || "").trim();
    if (!reason) {
      setStatus("admin_reason_required", "bad");
      return;
    }
    if (!confirm("Apply approved benefits now?")) return;
    state.busy = true;
    setControls();
    setStatus("Applying benefits…", "warn");
    try {
      const { response, body } = await jsonRequest("/v1/admin/campaigns/anniversary/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimId: state.claim.claimId, reason }),
      });
      if (!response.ok && body?.status !== "apply_partially_failed") throw new Error(body?.error || body?.status || "apply_failed");
      await loadClaim();
      setStatus(body?.status === "benefit_applied" ? "Benefits applied successfully." : "Apply needs manual follow-up.", body?.status === "benefit_applied" ? "ok" : "bad");
    } catch (error) {
      setStatus(`Apply failed: ${error?.message || "unknown_error"}`, "bad");
    } finally {
      state.busy = false;
      setControls();
    }
  }

  el.checkSession?.addEventListener("click", checkSession);
  el.load?.addEventListener("click", loadClaim);
  el.claimId?.addEventListener("keydown", (event) => { if (event.key === "Enter") loadClaim(); });
  el.clear?.addEventListener("click", () => {
    if (el.claimId) el.claimId.value = "";
    if (el.reason) el.reason.value = "";
    renderClaim(null);
    setStatus("Cleared. Load another claim when ready.", "warn");
  });
  for (const button of el.decisions) button.addEventListener("click", () => decide(button.dataset.campaignDecision));
  el.apply?.addEventListener("click", applyBenefits);

  checkSession();
})();
