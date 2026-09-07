export const COMMAND_CENTER_PATH = "/v1/admin/ai-ops/command-center";
export const COMMAND_PREVIEW_PATH = "/v1/admin/ai-ops/command/preview";

const PHASES = Object.freeze([
  { key: "command_center", label: "Command Center", status: "live_p0" },
  { key: "exception_inbox", label: "Exception Inbox", status: "live_p0" },
  { key: "action_cards", label: "Action Cards", status: "live_p0" },
  { key: "follow_up_autopilot", label: "Follow-up Autopilot", status: "planned_p1" },
  { key: "smart_matching", label: "Smart Matching", status: "planned_p1" },
  { key: "system_health", label: "System Health", status: "planned_p1_p2" },
]);

const COMMANDS = Object.freeze([
  {
    intent: "create_job",
    label: "Create Job",
    pattern: /(create\s*job|สร้างงาน|เปิดงาน|จองงาน|ทำงานให้|booking)/i,
    href: "/internal/admin/jobs/create-job",
    authority: "job_backend",
    summary: "เปิด Create Job และเริ่มจาก canonical Client ก่อนสร้างงาน",
  },
  {
    intent: "client_lookup",
    label: "หาลูกค้า",
    pattern: /(หาลูกค้า|ค้นลูกค้า|ลูกค้าคนนี้|client|customer|line\s*(name|id)|alias|เบอร์|อีเมล|email)/i,
    href: "/internal/admin/jobs/create-job",
    authority: "canonical_client_index",
    summary: "ใช้ Client lookup จาก canonical index ก่อน แล้วค่อยไปงานที่เกี่ยวข้อง",
  },
  {
    intent: "payments",
    label: "ตรวจ Payments",
    pattern: /(payment|paid|จ่าย|ชำระ|เงิน|ยอดโอน|สลิป|slip)/i,
    href: "/internal/admin/payments",
    authority: "payments-worker",
    summary: "เปิดหลักฐานการชำระเพื่อดูสถานะจาก payments-worker; AI Ops ไม่ mark paid เอง",
  },
  {
    intent: "membership_access",
    label: "เช็ก Membership Access",
    pattern: /(membership|member|สมาชิก|ต่ออายุ|renew|สิทธิ์|access|entitlement|telegram|drive)/i,
    href: "/internal/admin/membership-access",
    authority: "my_mmd_entitlement_resolver_v1",
    summary: "ดู Expected vs Observed โดยให้ entitlement resolver เป็น authority",
  },
  {
    intent: "models",
    label: "เช็ก Models",
    pattern: /(model|โมเดล|นายแบบ|gws|ems|profile|compcard|gallery|รูปโมเดล)/i,
    href: "/internal/ceo/models",
    authority: "canonical_model_record",
    summary: "เปิด Model Supply / readiness; final eligibility ยังอยู่ canonical model backend",
  },
  {
    intent: "kenji",
    label: "เปิด Kenji",
    pattern: /(kenji|เคนจิ|สอน ai|สอนเคนจิ|knowledge|คำตอบลูกค้า)/i,
    href: "/internal/admin/kenji",
    authority: "kenji_runtime",
    summary: "เปิด Friendly Kenji Admin เพื่อสอน แก้ ลองถาม และสรุปก่อนใช้จริง",
  },
  {
    intent: "mms",
    label: "เปิด MMS",
    pattern: /(mms|male\s*massage|massage|therapist|นวด|นักนวด)/i,
    href: "/internal/admin/mms",
    authority: "mms_backend",
    summary: "เปิด MMS operations โดยคง Partner/Owner scope ตาม backend",
  },
  {
    intent: "system_health",
    label: "ดู System Health",
    pattern: /(system\s*health|health|worker|webhook|ระบบล่ม|ระบบเสีย|error|เออเร่อ|ล่ม|route|airtable|r2|liff)/i,
    href: "/internal/admin/control-room",
    authority: "observed_health_only",
    summary: "ดูสถานะระบบที่ยืนยันได้; recovery mutation ต้องมี backend contract แยก",
  },
]);

export function buildCommandCenter(dashboardRead) {
  const dashboard = dashboardRead?.ok && dashboardRead?.data && typeof dashboardRead.data === "object"
    ? dashboardRead.data
    : null;

  if (!dashboard) {
    return {
      mode: "per_command_center_v1",
      status: "waiting",
      focus: null,
      needs_per: [exception({
        id: "dashboard_unavailable",
        kind: "system",
        title: "Command Center ยังอ่าน Dashboard ไม่ได้",
        summary: `Read source unavailable · HTTP ${Number(dashboardRead?.status || 0)}`,
        href: "/internal/admin/control-room",
        urgency: "warning",
        source: "/v1/admin/dashboard",
        authority: "read_only_observation",
      })],
      prepared: [],
      watching: { status: "planned_p1", autopilot_active: false, items: [] },
      done_today: waitingDoneToday(),
      system_health: [{ service: "admin-dashboard", state: "unavailable", impact: "Command Center summary is incomplete" }],
      phases: PHASES,
    };
  }

  const needsPer = dedupeById([
    ...asArray(dashboard.boss).map((item, index) => normalizeDashboardItem(item, `boss-${index + 1}`, "owner_exception", "high")),
    ...asArray(dashboard.todos).map((item, index) => normalizeDashboardItem(item, `todo-${index + 1}`, "todo", colorUrgency(item?.color))),
  ]).slice(0, 8);

  const prepared = needsPer.slice(0, 6).map((item, index) => actionCardFromException(item, index + 1));
  const watchingItems = buildWatching(dashboard);
  const health = buildHealth(dashboard.status || {});

  return {
    mode: "per_command_center_v1",
    status: "ready",
    focus: normalizeFocus(dashboard.focus),
    counts: {
      needs_per: needsPer.length,
      prepared: prepared.length,
      watching_candidates: watchingItems.length,
    },
    needs_per: needsPer,
    prepared,
    watching: {
      status: "foundation_only",
      autopilot_active: false,
      note: "P0 แสดงสิ่งที่ควรติดตามจาก verified dashboard; P1 จะเพิ่ม durable watch + due rule + notification audit",
      items: watchingItems.slice(0, 8),
    },
    done_today: waitingDoneToday(),
    system_health: health,
    phases: PHASES,
  };
}

export function previewCommand(rawText) {
  const text = String(rawText || "").trim().replace(/\s+/g, " ").slice(0, 600);
  if (!text) {
    return {
      ok: false,
      error: "command_required",
      message: "พิมพ์สิ่งที่เปอร์อยากให้ช่วยก่อน",
      supported: COMMANDS.map(({ intent, label }) => ({ intent, label })),
    };
  }

  const hit = COMMANDS.find((item) => item.pattern.test(text));
  if (!hit) {
    return {
      ok: true,
      matched: false,
      execution_mode: "preview_only",
      command: text,
      message: "ยังไม่รองรับคำสั่งนี้แบบปลอดภัย จึงยังไม่เดาหรือทำ action ให้",
      supported: COMMANDS.map(({ intent, label }) => ({ intent, label })),
      per_confirmation_required: false,
    };
  }

  return {
    ok: true,
    matched: true,
    execution_mode: "preview_only",
    command: text,
    intent: hit.intent,
    action_card: {
      id: `command:${hit.intent}`,
      kind: hit.intent,
      title: hit.label,
      summary: hit.summary,
      href: hit.href,
      authority: hit.authority,
      execution_mode: "handoff_only",
      per_confirmation_required: false,
      source: "per_command_preview_v1",
      query: text,
    },
    guard: guardForIntent(hit.intent),
    per_confirmation_required: false,
  };
}

function normalizeDashboardItem(item, fallbackId, kind, urgency) {
  const href = safeInternalHref(item?.href) || fallbackHref(kind);
  return exception({
    id: stringValue(item?.id || item?.record_id || fallbackId),
    kind,
    title: stringValue(item?.title || item?.tag || "ต้องดู"),
    summary: stringValue(item?.text || item?.summary || "มีรายการที่ควรตรวจ"),
    href,
    urgency,
    source: "/v1/admin/dashboard",
    authority: authorityForHref(href),
  });
}

function exception(input) {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    href: input.href,
    urgency: input.urgency || "normal",
    source: input.source,
    authority: input.authority,
    per_confirmation_required: false,
  };
}

function actionCardFromException(item, priority) {
  return {
    id: `prepared:${item.id}`,
    kind: item.kind,
    priority,
    title: item.title,
    summary: item.summary,
    href: item.href,
    authority: item.authority,
    execution_mode: "handoff_only",
    per_confirmation_required: false,
    source: item.source,
  };
}

function buildWatching(dashboard) {
  const out = [];
  for (const [index, item] of asArray(dashboard.money).entries()) {
    out.push({
      id: `payment-${index + 1}`,
      kind: "payment_waiting",
      title: stringValue(item?.title || "Payment waiting"),
      summary: stringValue(item?.text || item?.amount || "รอตรวจหลักฐานการชำระ"),
      href: safeInternalHref(item?.href) || "/internal/admin/payments",
      source: "/v1/admin/dashboard",
      durable_watch_active: false,
    });
  }
  for (const [index, item] of asArray(dashboard.jobs).entries()) {
    const searchable = `${item?.status || ""} ${item?.text || ""}`;
    if (!/(pending|รอ|confirm|hold|blocked|telegram)/i.test(searchable)) continue;
    out.push({
      id: `job-${stringValue(item?.id || index + 1)}`,
      kind: "job_follow_up",
      title: stringValue(item?.title || item?.id || "Job waiting"),
      summary: stringValue(item?.text || item?.status || "ควรติดตามสถานะงาน"),
      href: safeInternalHref(item?.href) || "/internal/admin/jobs/create-job",
      source: "/v1/admin/dashboard",
      durable_watch_active: false,
    });
  }
  for (const [index, item] of asArray(dashboard.members).entries()) {
    out.push({
      id: `member-${index + 1}`,
      kind: "membership_follow_up",
      title: stringValue(item?.title || "Member follow-up"),
      summary: stringValue(item?.text || item?.tag || "ควรตรวจสถานะสมาชิก"),
      href: safeInternalHref(item?.href) || "/internal/admin/member-intelligence",
      source: "/v1/admin/dashboard",
      durable_watch_active: false,
    });
  }
  return dedupeById(out);
}

function buildHealth(status) {
  const map = [
    ["admin", "admin"],
    ["payments", "payments"],
    ["telegram", "telegram"],
    ["data", "data"],
  ];
  return map.map(([key, service]) => ({
    service,
    state: healthState(status?.[key]),
    raw: stringValue(status?.[key] || "unknown"),
    source: "/v1/admin/dashboard",
  }));
}

function normalizeFocus(value) {
  if (!value || typeof value !== "object") return null;
  const title = stringValue(value.title);
  const text = stringValue(value.text);
  if (!title && !text) return null;
  return { title, text };
}

function waitingDoneToday() {
  return {
    status: "waiting",
    items: [],
    note: "ยังไม่มี canonical audit projection สำหรับ Done Today — จะไม่สร้าง activity จำลอง",
  };
}

function guardForIntent(intent) {
  if (intent === "payments") return "paid_state_remains_payments_worker";
  if (intent === "membership_access") return "entitlement_remains_resolver_authority";
  if (intent === "models") return "model_eligibility_remains_backend_authority";
  return "preview_only_no_mutation";
}

function authorityForHref(href) {
  if (href.startsWith("/internal/admin/payments")) return "payments-worker";
  if (href.startsWith("/internal/admin/membership-access")) return "my_mmd_entitlement_resolver_v1";
  if (href.startsWith("/internal/ceo/models") || href.startsWith("/internal/admin/studio")) return "canonical_model_record";
  if (href.startsWith("/internal/admin/kenji")) return "kenji_runtime";
  return "canonical_backend";
}

function fallbackHref(kind) {
  if (kind === "owner_exception") return "/internal/ceo";
  return "/internal/admin/control-room";
}

function safeInternalHref(value) {
  const href = stringValue(value);
  if (!href.startsWith("/internal/") && !href.startsWith("/sigil/") && !href.startsWith("/shop/")) return "";
  if (/^\/\//.test(href)) return "";
  return href.slice(0, 500);
}

function colorUrgency(value) {
  const text = stringValue(value).toLowerCase();
  if (text === "red") return "high";
  if (text === "yellow" || text === "gold") return "normal";
  return "normal";
}

function healthState(value) {
  const text = stringValue(value).toLowerCase();
  if (!text) return "unknown";
  if (/(พร้อม|ready|ok|healthy|active)/i.test(text)) return "ready";
  if (/(partial|บางส่วน|degraded|waiting)/i.test(text)) return "degraded";
  if (/(error|fail|down|unavailable|missing|blocked)/i.test(text)) return "unavailable";
  return "unknown";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = stringValue(item?.id || `${item?.kind}|${item?.title}|${item?.summary}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
