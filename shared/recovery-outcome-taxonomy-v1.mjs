export const RECOVERY_OUTCOME_TAXONOMY_VERSION = "mmd-recovery-outcome-taxonomy-v1-20260919";

export const RECOVERY_CASE_STATES = Object.freeze([
  "prepared",
  "sent",
  "acknowledged",
  "reviewing",
  "resolved",
  "customer_notified",
]);

export const RECOVERY_DOMAINS = Object.freeze([
  "unclassified",
  "mmd_shop",
  "booking",
  "mms",
]);

const COMMON_OUTCOMES = Object.freeze({
  intake_received: {
    terminal: false,
    label_th: "รับเคสแล้ว",
    label_en: "Case received",
  },
  awaiting_customer: {
    terminal: false,
    label_th: "รอข้อมูลจากลูกค้า",
    label_en: "Awaiting customer",
  },
  awaiting_operations: {
    terminal: false,
    label_th: "รอทีมดำเนินการ",
    label_en: "Awaiting operations",
  },
  information_confirmed: {
    terminal: true,
    label_th: "ยืนยันข้อมูลและชี้แจงแล้ว",
    label_en: "Information confirmed",
  },
  no_adjustment_required: {
    terminal: true,
    label_th: "ตรวจแล้ว ไม่ต้องปรับรายการ",
    label_en: "No adjustment required",
  },
  closed_duplicate: {
    terminal: true,
    label_th: "ปิดเคสซ้ำ",
    label_en: "Closed as duplicate",
  },
  closed_withdrawn: {
    terminal: true,
    label_th: "ลูกค้ายุติการติดตามเคส",
    label_en: "Customer withdrew case",
  },
});

const DOMAIN_OUTCOMES = Object.freeze({
  unclassified: Object.freeze({}),
  mmd_shop: Object.freeze({
    replacement_arranged: {
      terminal: true,
      label_th: "จัด Replacement แล้ว",
      label_en: "Replacement arranged",
    },
    reshipment_arranged: {
      terminal: true,
      label_th: "จัดส่งใหม่แล้ว",
      label_en: "Reshipment arranged",
    },
    refund_route_opened: {
      terminal: true,
      label_th: "ส่งเข้ากระบวนการ Refund แล้ว",
      label_en: "Refund route opened",
    },
  }),
  booking: Object.freeze({
    rebooking_arranged: {
      terminal: true,
      label_th: "จัด Rebooking แล้ว",
      label_en: "Rebooking arranged",
    },
    schedule_adjustment_arranged: {
      terminal: true,
      label_th: "ปรับกำหนดการแล้ว",
      label_en: "Schedule adjustment arranged",
    },
    service_credit_route_opened: {
      terminal: true,
      label_th: "ส่งเข้ากระบวนการ Service Credit แล้ว",
      label_en: "Service credit route opened",
    },
  }),
  mms: Object.freeze({
    therapist_replacement_arranged: {
      terminal: true,
      label_th: "จัด Therapist Replacement แล้ว",
      label_en: "Therapist replacement arranged",
    },
    rebooking_arranged: {
      terminal: true,
      label_th: "จัด Rebooking แล้ว",
      label_en: "Rebooking arranged",
    },
    service_adjustment_arranged: {
      terminal: true,
      label_th: "จัด Service Adjustment แล้ว",
      label_en: "Service adjustment arranged",
    },
    service_credit_route_opened: {
      terminal: true,
      label_th: "ส่งเข้ากระบวนการ Service Credit แล้ว",
      label_en: "Service credit route opened",
    },
  }),
});

export function normalizeRecoveryDomain(value = "") {
  const key = token(value);
  if (RECOVERY_DOMAINS.includes(key)) return key;
  if (["shop", "mmdshop", "mmd_shop_order"].includes(key)) return "mmd_shop";
  if (["job", "jobs", "booking_job"].includes(key)) return "booking";
  if (["male_massage", "massage", "henna"].includes(key)) return "mms";
  return "unclassified";
}

export function recoveryOutcomeDefinition(domain = "unclassified", code = "") {
  const normalizedDomain = normalizeRecoveryDomain(domain);
  const normalizedCode = token(code);
  if (!normalizedCode) return null;
  return COMMON_OUTCOMES[normalizedCode] || DOMAIN_OUTCOMES[normalizedDomain]?.[normalizedCode] || null;
}

export function recoveryOutcomeAllowed(domain = "unclassified", code = "", caseState = "") {
  const definition = recoveryOutcomeDefinition(domain, code);
  if (!definition) return false;
  const state = token(caseState);
  if (!RECOVERY_CASE_STATES.includes(state)) return false;
  if (definition.terminal) return ["resolved", "customer_notified"].includes(state);
  return !["resolved", "customer_notified"].includes(state);
}

export function isTerminalRecoveryOutcome(domain = "unclassified", code = "") {
  return recoveryOutcomeDefinition(domain, code)?.terminal === true;
}

export function recoveryOutcomeLabel(domain = "unclassified", code = "", locale = "th") {
  const definition = recoveryOutcomeDefinition(domain, code);
  if (!definition) return "";
  return String(locale || "").toLowerCase().startsWith("en") ? definition.label_en : definition.label_th;
}

export function recoveryOutcomeCodesForDomain(domain = "unclassified", options = {}) {
  const normalizedDomain = normalizeRecoveryDomain(domain);
  const terminal = options.terminal;
  return [
    ...Object.entries(COMMON_OUTCOMES),
    ...Object.entries(DOMAIN_OUTCOMES[normalizedDomain] || {}),
  ]
    .filter(([, definition]) => terminal === undefined || definition.terminal === terminal)
    .map(([code]) => code);
}

export function inferRecoveryDomain(value = "", correlation = null) {
  if (correlation?.domain === "mmd_shop") return "mmd_shop";
  const text = String(value || "").normalize("NFKC").toLowerCase();
  if (/(?:mms|male\s*massage|therapist|เทอราปิส|นวด|massage|หมอนวด)/i.test(text)) return "mms";
  if (/(?:booking|จอง|นัด|คิว|model|โมเดล|นายแบบ|job|งานบริการ)/i.test(text)) return "booking";
  if (/(?:mmd\s*shop|shop|order|ออเดอร์|ออร์เดอร์|คำสั่งซื้อ|gg\s*water|พัสดุ|tracking|จัดส่ง)/i.test(text)) return "mmd_shop";
  return "unclassified";
}

function token(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
