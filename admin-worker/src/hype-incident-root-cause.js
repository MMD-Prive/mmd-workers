export const HYPE_INCIDENT_DIGEST_SCHEMA = "mmd.hype_incident_root_cause_digest.v1";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) && x >= 0 ? x : 0;
}

function hasCode(observer, code) {
  return Array.isArray(observer?.alert_codes) && observer.alert_codes.includes(code);
}

function incident({ code, severity, confidence, layer, title, explanation, evidence = [], action }) {
  const ranks = { critical: 4, warning: 3, attention: 2, info: 1 };
  const confidenceRanks = { high: 3, medium: 2, low: 1 };
  return {
    code,
    severity,
    severity_rank: ranks[severity] || 0,
    confidence,
    confidence_rank: confidenceRanks[confidence] || 0,
    likely_layer: layer,
    title,
    explanation,
    evidence: evidence.map((x) => clean(x, 300)).filter(Boolean).slice(0, 8),
    owner_action: {
      title: clean(action?.title, 160),
      href: clean(action?.href, 300) || "/internal/admin/control-room",
      authority: clean(action?.authority, 120) || "read_only_diagnostic",
    },
  };
}

export function buildIncidentRootCauseDigest({ observer = null, router = null, recovery = null } = {}) {
  const incidents = [];
  const observerAvailable = observer?.available === true;
  const routerAvailable = router?.available === true;
  const recoveryAvailable = recovery?.available === true;

  if (!routerAvailable) {
    incidents.push(incident({
      code: "telegram_router_health_unavailable",
      severity: "warning",
      confidence: "high",
      layer: "health_control_plane",
      title: "Telegram Router Health unavailable",
      explanation: "HYPE cannot prove Telegram routing health, so delivery diagnosis must fail closed.",
      evidence: ["router health projection unavailable"],
      action: { title: "ตรวจ Telegram Router Health", href: "/internal/admin/control-room", authority: "telegram_router_health_read_only" },
    }));
  } else if (router.status === "degraded") {
    incidents.push(incident({
      code: "telegram_router_degraded",
      severity: "critical",
      confidence: "high",
      layer: "telegram_transport",
      title: "Telegram Router degraded",
      explanation: "At least one canonical Telegram transport/configuration requirement is unavailable or the live probe failed.",
      evidence: [
        "router status=degraded",
        ...((Array.isArray(router.causes) ? router.causes : []).slice(0, 5).map((x) => "cause=" + x)),
        "unavailable lanes=" + n(router?.counts?.unavailable),
      ],
      action: { title: "เปิด Telegram Router diagnostic", href: "/internal/admin/control-room", authority: "telegram-worker" },
    }));
  }

  if (observerAvailable && hasCode(observer, "outbox_failed_terminal")) {
    const routerDegraded = routerAvailable && router.status === "degraded";
    incidents.push(incident({
      code: routerDegraded ? "telegram_delivery_chain_degraded" : "ops_outbox_terminal_failure",
      severity: "critical",
      confidence: "high",
      layer: routerDegraded ? "telegram_transport" : "notification_outbox",
      title: routerDegraded ? "Telegram delivery chain degraded" : "Ops notification reached terminal failure",
      explanation: routerDegraded
        ? "The durable outbox has terminal failures while the Telegram router is degraded, so the strongest evidence points to the notification delivery chain."
        : "The durable outbox has terminal failures while the router is not degraded; inspect destination/response-specific delivery state.",
      evidence: [
        "outbox failed_terminal=" + n(observer.outbox_failed_terminal),
        "outbox retryable=" + n(observer.outbox_retryable),
        "router status=" + clean(router?.status, 40),
      ],
      action: { title: "ตรวจ Outbox + Telegram Router", href: "/internal/admin/control-room", authority: "notification_only" },
    }));
  }

  if (observerAvailable && hasCode(observer, "extractor_degraded")) {
    incidents.push(incident({
      code: "payment_extractor_degraded",
      severity: "critical",
      confidence: "high",
      layer: "slip_extractor",
      title: "Payment extractor degraded",
      explanation: "Repeated extractor failures are producing held evidence and can explain a drop in accepted payment proofs.",
      evidence: [
        "extractor failures 1h=" + n(observer.extractor_failures_1h),
        "extractor consecutive=" + n(observer.extractor_consecutive_failures),
        "held open=" + n(observer.held_open),
      ],
      action: { title: "ตรวจ Slip Extractor / Held Evidence", href: "/internal/admin/payments", authority: "evidence_diagnostic_only" },
    }));
  }

  if (observerAvailable && hasCode(observer, "held_spike")) {
    incidents.push(incident({
      code: "held_evidence_spike",
      severity: "warning",
      confidence: "high",
      layer: "payment_evidence_classification",
      title: "Held payment evidence spike",
      explanation: "Uncertain evidence is accumulating faster than normal and requires extractor/classifier review before it can become a Payment Proof.",
      evidence: [
        "held open=" + n(observer.held_open),
        "held new 1h=" + n(observer.held_new_1h),
      ],
      action: { title: "ตรวจ Held Evidence", href: "/internal/admin/payments", authority: "evidence_only" },
    }));
  }

  if (observerAvailable && hasCode(observer, "membership_v4_absent")) {
    incidents.push(incident({
      code: "payment_observer_contract_stale",
      severity: "critical",
      confidence: "high",
      layer: "payment_observer_runtime",
      title: "Payment observer v4 contract absent",
      explanation: "The runtime heartbeat does not advertise the expected v4 observer contract. This is a deployment/runtime contract problem, not evidence that a customer payment failed.",
      evidence: [
        "membership v4 heartbeat absent",
        "last accepted slip=" + (clean(observer.last_accepted_slip_at, 80) || "unknown"),
      ],
      action: { title: "ตรวจ Payment Observer deployment", href: "/internal/admin/control-room", authority: "runtime_diagnostic_only" },
    }));
  }

  if (observerAvailable && (hasCode(observer, "slip_silent_48h") || hasCode(observer, "slip_silent_24h"))) {
    const critical = hasCode(observer, "slip_silent_48h");
    const extractorDegraded = hasCode(observer, "extractor_degraded");
    const routerDegraded = routerAvailable && router.status === "degraded";
    const layer = extractorDegraded ? "slip_extractor" : "line_payment_ingress";
    const confidence = extractorDegraded ? "high" : routerDegraded ? "medium" : "medium";
    const explanation = extractorDegraded
      ? "Accepted LINE payment evidence is silent while extractor degradation is independently observed."
      : routerDegraded
        ? "Accepted LINE payment evidence is silent, but Telegram is also degraded. Telegram cannot explain intake silence by itself, so inspect LINE ingress before attributing cause."
        : "Accepted LINE payment evidence is silent while Telegram delivery is not degraded. The next diagnostic layer is LINE image ingress / classification rather than Telegram.";
    incidents.push(incident({
      code: critical ? "line_payment_ingress_silent_48h" : "line_payment_ingress_silent_24h",
      severity: critical ? "critical" : "warning",
      confidence,
      layer,
      title: critical ? "LINE payment ingress silent >48h" : "LINE payment ingress silent >24h",
      explanation,
      evidence: [
        "silence hours=" + Number(observer.silence_hours || 0).toFixed(1),
        "accepted last 24h=" + n(observer.accepted_last_24h),
        "last accepted=" + (clean(observer.last_accepted_slip_at, 80) || "unknown"),
        "router status=" + clean(router?.status, 40),
      ],
      action: { title: "ตรวจ LINE Payment Ingress", href: "/internal/admin/payments", authority: "evidence_diagnostic_only" },
    }));
  }

  if (routerAvailable && router.status === "partial" && n(router?.counts?.legacy_direct_senders) > 0) {
    incidents.push(incident({
      code: "telegram_router_legacy_sender_drift",
      severity: "attention",
      confidence: "high",
      layer: "notification_governance",
      title: "Telegram routing still has legacy direct senders",
      explanation: "Core route ownership is locked to telegram-worker, but some domain senders still call Telegram directly. Delivery may work, yet central health cannot fully observe those paths until migrated.",
      evidence: [
        "legacy direct senders=" + n(router?.counts?.legacy_direct_senders),
        "partial lanes=" + n(router?.counts?.partial),
      ],
      action: { title: "ดู Telegram migration lanes", href: "/internal/admin/control-room", authority: "governance_only" },
    }));
  }

  if (recoveryAvailable && n(recovery.overdue_count) > 0) {
    incidents.push(incident({
      code: "recovery_queue_overdue",
      severity: "warning",
      confidence: "high",
      layer: "recovery_operations",
      title: "Recovery cases overdue",
      explanation: "Recovery workflow metadata shows cases beyond SLA. This is an operational queue condition and does not grant or mutate business truth.",
      evidence: [
        "recovery overdue=" + n(recovery.overdue_count),
        "recovery attention=" + n(recovery.attention_count),
        "unassigned attention=" + n(recovery.attention_unassigned_count),
      ],
      action: { title: "เปิด Recovery Control", href: "/internal/admin/recovery", authority: "recovery_metadata_only" },
    }));
  }

  incidents.sort((a, b) => (b.severity_rank - a.severity_rank) || (b.confidence_rank - a.confidence_rank) || a.code.localeCompare(b.code));
  const primary = incidents[0] || null;
  const criticalCount = incidents.filter((x) => x.severity === "critical").length;
  const warningCount = incidents.filter((x) => x.severity === "warning").length;
  const attentionCount = incidents.filter((x) => x.severity === "attention").length;

  return {
    schema: HYPE_INCIDENT_DIGEST_SCHEMA,
    generated_at: new Date().toISOString(),
    status: criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : attentionCount > 0 ? "attention" : "healthy",
    incident_count: incidents.length,
    critical_count: criticalCount,
    warning_count: warningCount,
    attention_count: attentionCount,
    primary: primary ? {
      code: primary.code,
      severity: primary.severity,
      confidence: primary.confidence,
      likely_layer: primary.likely_layer,
      title: primary.title,
      explanation: primary.explanation,
      evidence: primary.evidence,
      owner_action: primary.owner_action,
    } : {
      code: "no_active_incident",
      severity: "info",
      confidence: "high",
      likely_layer: "none",
      title: "No active cross-system incident",
      explanation: "Available health sources do not currently show an actionable incident.",
      evidence: [],
      owner_action: { title: "เปิด Owner Control Room", href: "/internal/admin/control-room", authority: "read_only_observation" },
    },
    incidents: incidents.slice(0, 8).map(({ severity_rank, confidence_rank, ...item }) => item),
    source_availability: {
      payment_observer: observerAvailable,
      telegram_router: routerAvailable,
      recovery_queue: recoveryAvailable,
    },
    authority: {
      diagnostic_only: true,
      business_truth_inferred: false,
      may_mutate_business_truth: false,
      payment_truth: "payments-worker",
      entitlement_truth: "my_mmd_entitlement_resolver_v1",
    },
  };
}
