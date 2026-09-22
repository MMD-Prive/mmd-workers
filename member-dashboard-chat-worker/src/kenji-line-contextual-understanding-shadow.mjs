export const KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA = "mmd.kenji_line_contextual_understanding.v1";
export const KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED_ENV = "KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED";

const DEFAULT_CONTEXT_MODEL = "gpt-4.1-mini";
const MODEL_TIMEOUT_MS = 5_500;
const MAX_TRANSCRIPT_TURNS = 12;
const MAX_TURN_TEXT = 520;

const RELATIONS = Object.freeze([
  "standalone",
  "continuation",
  "correction",
  "comparison",
  "rejection",
  "topic_switch",
  "referential_followup",
  "clarification_needed",
]);

const TOPIC_RELATIONS = Object.freeze(["same_topic", "new_topic", "unclear"]);
const REFERENT_STATES = Object.freeze(["not_needed", "resolved", "unresolved"]);
const REFERENT_TYPES = Object.freeze(["none", "model", "service", "booking", "payment", "membership", "message", "option", "unknown"]);
const CONTEXT_FIELDS = Object.freeze(["day", "time", "area", "model", "service", "budget", "duration", "style", "other"]);
const PRICE_DIRECTIONS = Object.freeze(["lower", "higher", "same", "unknown"]);

const CORRECTION_RE = /(?:เปลี่ยน|แก้|เลื่อน|ปรับเป็น|ย้ายเป็น|ไม่ใช่.{0,24}(?:เอา|หมายถึง|เป็น)|ขอเป็น|เอาเป็น|change|correct|instead)/i;
const EXPLICIT_TOPIC_SWITCH_RE = /(?:^|\s)(?:อีกเรื่อง|เปลี่ยนเรื่อง|เรื่องใหม่|ถามอีกอย่าง|ถามเรื่องอื่น|new topic|another question|different topic)(?:\s|$)/i;
const COMPARISON_RE = /(?:เทียบ|เปรียบเทียบ|อีกคน|อีกตัว|อีกแบบ|มีแนวนี้อีก|คล้าย(?:คน|แบบ|แนว)นี้|อันที่สอง|ตัวที่สอง|คนที่สอง|compare|another one|similar)/i;
const REJECTION_RE = /(?:ไม่เอา|ไม่ชอบ|แพงไป|เกินงบ|ไม่ใช่คนนี้|ไม่ใช่อันนี้|ไม่เหมาะ|too expensive|don't want|not this)/i;
const REFERENT_RE = /(?:คนเดิม|คนนี้|คนเมื่อกี้|ตัวเดิม|ตัวนี้|อันเดิม|อันนี้|อันที่สอง|แบบเดิม|แบบนี้|แบบเมื่อกี้|แนวนี้|ที่คุยเมื่อกี้|ของเมื่อกี้|same one|this one|second one|like this)/i;
const TIME_RE = /(?:\d{1,2}\s*[:.]\s*\d{2}|(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|\d{1,2})\s*ทุ่ม|\d{1,2}\s*โมง)/i;
const DAY_RE = /(?:วันนี้|พรุ่งนี้|มะรืน|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์|\d{1,2}[/-]\d{1,2})/i;
const AREA_RE = /(?:สุขุมวิท|ทองหล่อ|เอกมัย|สาทร|สีลม|อโศก|พร้อมพงษ์|เพลินจิต|ชิดลม|ลาดพร้าว|รัชดา|พระรามเก้า|อารีย์|พญาไท|ปทุมวัน|เยาวราช)/i;
const BUDGET_RE = /(?:งบ|ราคา|เรท|แพง|ถูก|บาท|\bk\b|budget|price|rate)/i;
const DURATION_RE = /(?:\d+(?:\.\d+)?\s*(?:ชม\.?|ชั่วโมง|hr|hrs|hours?)|90\s*นาที|overnight)/i;
const MODEL_RE = /(?:EMs?[-_]?\d+|นายแบบ|โมเดล|model|คนนี้|คนเดิม|อีกคน)/i;
const SERVICE_RE = /(?:companion|dinner|event|massage|mms|นวด|บริการ)/i;

function text(value, max = 1200) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeProviderToken(value) {
  return text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return text(event.message.text, MAX_TURN_TEXT);
  if (event?.type === "postback") return text(event?.postback?.displayText || event?.postback?.data, MAX_TURN_TEXT);
  return "";
}

function isDirectCustomerEvent(event = {}) {
  return event?.source?.type === "user" && Boolean(eventText(event));
}

function transcriptTurns(history = {}) {
  return list(history?.turns)
    .filter((turn) => ["customer", "assistant"].includes(text(turn?.role, 20).toLowerCase()) && text(turn?.content, MAX_TURN_TEXT))
    .slice(-MAX_TRANSCRIPT_TURNS)
    .map((turn, index) => ({
      index,
      role: text(turn.role, 20).toLowerCase(),
      content: text(turn.content, MAX_TURN_TEXT),
      evidence: text(turn.evidence, 40),
    }));
}

function currentPatchFields(message = "", memory = {}) {
  const fields = [];
  if (TIME_RE.test(message)) fields.push("time");
  if (DAY_RE.test(message)) fields.push("day");
  if (AREA_RE.test(message)) fields.push("area");
  if (BUDGET_RE.test(message)) fields.push("budget");
  if (DURATION_RE.test(message)) fields.push("duration");
  if (MODEL_RE.test(message)) fields.push("model");
  if (SERVICE_RE.test(message)) fields.push("service");

  const latestCorrection = list(memory?.corrections).slice(-1)[0];
  if (CORRECTION_RE.test(message) && CONTEXT_FIELDS.includes(text(latestCorrection?.field, 40))) {
    fields.push(text(latestCorrection.field, 40));
  }
  return unique(fields);
}

function preservedKnownFields(patchFields = [], memory = {}) {
  const known = list(memory?.known_facts).map((item) => text(item?.field, 40)).filter((field) => CONTEXT_FIELDS.includes(field));
  return known.filter((field) => !patchFields.includes(field));
}

function recentCustomerText(turns = [], count = 3) {
  return turns
    .filter((turn) => turn.role === "customer")
    .slice(-count)
    .map((turn) => turn.content)
    .join(" ");
}

function fallbackUnderstanding({ history = {}, event = {} } = {}) {
  const turns = transcriptTurns(history);
  const message = eventText(event) || text(history?.memory?.latest_customer_message, MAX_TURN_TEXT);
  const memory = object(history?.memory);
  const priorTurns = turns.slice(0, -1);
  const hasContext = priorTurns.length > 0;
  const patchFields = CORRECTION_RE.test(message) ? currentPatchFields(message, memory) : [];
  const recent = recentCustomerText(turns, 4);

  let relation = "standalone";
  let topicRelation = hasContext ? "unclear" : "new_topic";
  let referentState = "not_needed";
  let referentType = "none";
  let referentLabel = "";
  let needsClarification = false;
  let clarificationTarget = "";
  let confidence = hasContext ? 0.58 : 0.82;

  if (EXPLICIT_TOPIC_SWITCH_RE.test(message)) {
    relation = "topic_switch";
    topicRelation = "new_topic";
    confidence = 0.98;
  } else if (CORRECTION_RE.test(message)) {
    relation = "correction";
    topicRelation = hasContext ? "same_topic" : "unclear";
    confidence = patchFields.length ? 0.91 : 0.68;
    if (!patchFields.length) {
      needsClarification = true;
      clarificationTarget = "field_being_corrected";
    }
  } else if (COMPARISON_RE.test(message)) {
    relation = "comparison";
    topicRelation = hasContext ? "same_topic" : "unclear";
    confidence = hasContext ? 0.76 : 0.54;
  } else if (REJECTION_RE.test(message)) {
    relation = "rejection";
    topicRelation = hasContext ? "same_topic" : "unclear";
    confidence = hasContext ? 0.78 : 0.55;
  } else if (REFERENT_RE.test(message)) {
    relation = "referential_followup";
    topicRelation = hasContext ? "same_topic" : "unclear";
    confidence = hasContext ? 0.7 : 0.45;
  } else if (hasContext && message.length <= 120) {
    relation = "continuation";
    topicRelation = "same_topic";
    confidence = 0.62;
  }

  if (REFERENT_RE.test(message) || relation === "comparison" || relation === "rejection") {
    referentType = MODEL_RE.test(message) ? "model" : "option";
    const hasRecentAssistant = priorTurns.some((turn) => turn.role === "assistant");
    if (hasRecentAssistant && !/(?:อันที่สอง|ตัวที่สอง|คนที่สอง|second one)/i.test(message)) {
      referentState = "resolved";
      referentLabel = "previous_discussed_option";
    } else {
      referentState = "unresolved";
      needsClarification = true;
      clarificationTarget ||= "referent";
    }
  }

  const wantsSimilar = /(?:แนวนี้|แบบนี้|คล้าย|similar|like this)/i.test(message);
  const lowerPrice = /(?:แพงไป|เกินงบ|ถูกกว่า|ราคาลง|ลดงบ|lower|cheaper|too expensive)/i.test(recent);
  const higherPrice = /(?:เพิ่มงบ|แพงกว่านี้|สูงกว่า|higher budget)/i.test(recent);
  const rejectedReference = REJECTION_RE.test(message) && !/(?:แพงไป|เกินงบ|too expensive)/i.test(message);
  const likedReference = /(?:ชอบ|ดูดี|โอเคคนนี้|ถูกใจ|like|looks good)/i.test(recent);

  return {
    schema: KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
    relation,
    topic_relation: topicRelation,
    referent_state: referentState,
    referent_type: referentType,
    referent_label: referentLabel,
    patch_fields: patchFields,
    preserve_fields: relation === "correction" ? preservedKnownFields(patchFields, memory) : [],
    preference_delta: {
      wants_similar: wantsSimilar,
      price_direction: lowerPrice ? "lower" : higherPrice ? "higher" : "unknown",
      liked_reference: likedReference,
      rejected_reference: rejectedReference,
      notes: "",
    },
    needs_clarification: needsClarification,
    clarification_target: clarificationTarget,
    confidence,
    evidence_turn_indexes: turns.length ? [Math.max(0, turns.length - 1)] : [],
    analysis_note: "deterministic_fallback_only",
    analysis_source: "deterministic_fallback",
    model_attempted: false,
    model_success: false,
    shadow_only: true,
    auto_send_allowed: false,
    customer_copy_changed: false,
  };
}

function extractOutputText(payload = {}) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of list(payload?.output)) {
    for (const content of list(item?.content)) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function normalizeModelResult(parsed = {}, turnCount = 0) {
  const relation = RELATIONS.includes(parsed?.relation) ? parsed.relation : "clarification_needed";
  const topicRelation = TOPIC_RELATIONS.includes(parsed?.topic_relation) ? parsed.topic_relation : "unclear";
  const referentState = REFERENT_STATES.includes(parsed?.referent_state) ? parsed.referent_state : "unresolved";
  const referentType = REFERENT_TYPES.includes(parsed?.referent_type) ? parsed.referent_type : "unknown";
  const patchFields = unique(list(parsed?.patch_fields).map((value) => text(value, 40))).filter((value) => CONTEXT_FIELDS.includes(value));
  const preserveFields = unique(list(parsed?.preserve_fields).map((value) => text(value, 40))).filter((value) => CONTEXT_FIELDS.includes(value) && !patchFields.includes(value));
  const priceDirection = PRICE_DIRECTIONS.includes(parsed?.preference_delta?.price_direction)
    ? parsed.preference_delta.price_direction
    : "unknown";
  const evidenceTurnIndexes = unique(list(parsed?.evidence_turn_indexes)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < turnCount));

  return {
    schema: KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
    relation,
    topic_relation: topicRelation,
    referent_state: referentState,
    referent_type: referentType,
    referent_label: text(parsed?.referent_label, 120),
    patch_fields: patchFields,
    preserve_fields: preserveFields,
    preference_delta: {
      wants_similar: parsed?.preference_delta?.wants_similar === true,
      price_direction: priceDirection,
      liked_reference: parsed?.preference_delta?.liked_reference === true,
      rejected_reference: parsed?.preference_delta?.rejected_reference === true,
      notes: text(parsed?.preference_delta?.notes, 180),
    },
    needs_clarification: parsed?.needs_clarification === true || referentState === "unresolved",
    clarification_target: text(parsed?.clarification_target, 100),
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence) || 0)),
    evidence_turn_indexes: evidenceTurnIndexes,
    analysis_note: text(parsed?.analysis_note, 220),
    analysis_source: "model",
    model_attempted: true,
    model_success: true,
    shadow_only: true,
    auto_send_allowed: false,
    customer_copy_changed: false,
  };
}

async function modelUnderstanding({ env = {}, history = {}, event = {}, fetchImpl = fetch } = {}) {
  const apiKey = text(env.OPENAI_API_KEY, 300);
  if (!apiKey) return { ok: false, attempted: false, reason: "openai_key_missing", result: null };
  const turns = transcriptTurns(history);
  if (turns.length < 2) return { ok: false, attempted: false, reason: "insufficient_turns", result: null };

  const transcript = turns
    .map((turn) => `[${turn.index}] ${turn.role === "assistant" ? "ASSISTANT_SENT" : "CUSTOMER"}: ${turn.content}`)
    .join("\n");
  const memory = object(history?.memory);
  const knownFacts = list(memory?.known_facts)
    .slice(-8)
    .map((item) => `${text(item?.field, 40)}=${text(item?.value, 100)} @ ${text(item?.occurred_at, 50)}`)
    .join("; ");

  const instructions = `You analyze continuity in an MMD Privé LINE conversation. Do not answer the customer and do not produce customer-facing copy.

Your only task is semantic relationship analysis for the LATEST CUSTOMER message using the supplied transcript.

Rules:
- Use the whole visible conversation, not isolated keywords.
- Distinguish continuation, correction, comparison, rejection, topic switch, and referential follow-up.
- Resolve phrases such as "คนเดิม", "คนนี้", "อันที่สอง", "แบบเมื่อกี้" only when the transcript contains one uniquely supported referent. Otherwise mark referent_state=unresolved and needs_clarification=true.
- A correction is a patch. Put only explicitly changed fields in patch_fields; preserve previously stated unchanged fields in preserve_fields.
- Preference inference must be narrow. Example: "คนนี้ดูดี" -> "แต่แพงไปหน่อย" -> "มีแนวนี้อีกไหม" means liked_reference=true, wants_similar=true, price_direction=lower. It does not authorize a recommendation or price.
- If the customer explicitly changes topic, do not drag the old topic into the new one.
- Never infer booking confirmation, availability, payment, membership, entitlement, price, or any other business truth.
- evidence_turn_indexes must point only to transcript indexes that support the classification.
- analysis_note must be short and internal.
- Return only the JSON schema requested.`;

  const payload = {
    model: text(env.KENJI_CONTEXTUAL_OPENAI_MODEL, 80) || DEFAULT_CONTEXT_MODEL,
    instructions,
    input: `Known evidence-backed facts: ${knownFacts || "none"}\n\nTranscript:\n${transcript}`,
    max_output_tokens: 300,
    text: {
      format: {
        type: "json_schema",
        name: "kenji_contextual_understanding_shadow",
        strict: true,
        schema: {
          type: "object",
          properties: {
            relation: { type: "string", enum: RELATIONS },
            topic_relation: { type: "string", enum: TOPIC_RELATIONS },
            referent_state: { type: "string", enum: REFERENT_STATES },
            referent_type: { type: "string", enum: REFERENT_TYPES },
            referent_label: { type: "string" },
            patch_fields: { type: "array", items: { type: "string", enum: CONTEXT_FIELDS } },
            preserve_fields: { type: "array", items: { type: "string", enum: CONTEXT_FIELDS } },
            preference_delta: {
              type: "object",
              properties: {
                wants_similar: { type: "boolean" },
                price_direction: { type: "string", enum: PRICE_DIRECTIONS },
                liked_reference: { type: "boolean" },
                rejected_reference: { type: "boolean" },
                notes: { type: "string" },
              },
              required: ["wants_similar", "price_direction", "liked_reference", "rejected_reference", "notes"],
              additionalProperties: false,
            },
            needs_clarification: { type: "boolean" },
            clarification_target: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            evidence_turn_indexes: { type: "array", items: { type: "integer", minimum: 0 } },
            analysis_note: { type: "string" },
          },
          required: [
            "relation",
            "topic_relation",
            "referent_state",
            "referent_type",
            "referent_label",
            "patch_fields",
            "preserve_fields",
            "preference_delta",
            "needs_clarification",
            "clarification_target",
            "confidence",
            "evidence_turn_indexes",
            "analysis_note",
          ],
          additionalProperties: false,
        },
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_contextual_shadow_timeout"), MODEL_TIMEOUT_MS);
  try {
    const response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => null);
      const providerCode = safeProviderToken(providerError?.error?.code);
      const providerType = safeProviderToken(providerError?.error?.type);
      const suffix = providerCode || providerType;
      return {
        ok: false,
        attempted: true,
        reason: `openai_http_${response.status}${suffix ? `_${suffix}` : ""}`,
        result: null,
      };
    }
    const body = await response.json().catch(() => null);
    if (!body) return { ok: false, attempted: true, reason: "openai_invalid_json", result: null };
    if (body.status && body.status !== "completed") {
      return {
        ok: false,
        attempted: true,
        reason: `openai_status_${text(body.status, 40).toLowerCase() || "unknown"}`,
        result: null,
      };
    }
    const raw = extractOutputText(body);
    if (!raw) return { ok: false, attempted: true, reason: "openai_output_missing", result: null };
    try {
      const parsed = JSON.parse(raw);
      return { ok: true, attempted: true, reason: "", result: normalizeModelResult(parsed, turns.length) };
    } catch (_) {
      return { ok: false, attempted: true, reason: "openai_output_parse_failed", result: null };
    }
  } catch (error) {
    const timedOut = controller.signal.aborted || error?.name === "AbortError";
    return {
      ok: false,
      attempted: true,
      reason: timedOut ? "openai_timeout" : "openai_request_failed",
      result: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function observeKenjiLineContextualUnderstandingShadow({
  env = {},
  history = {},
  event = {},
  fetchImpl = fetch,
} = {}) {
  if (!enabled(env[KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED_ENV])) {
    return {
      enabled: false,
      schema: KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
      relation: "standalone",
      analysis_source: "disabled",
      model_attempted: false,
      model_success: false,
      shadow_only: true,
      auto_send_allowed: false,
      customer_copy_changed: false,
    };
  }

  if (!isDirectCustomerEvent(event)) {
    return {
      enabled: true,
      schema: KENJI_LINE_CONTEXTUAL_UNDERSTANDING_SCHEMA,
      relation: "standalone",
      analysis_source: "not_applicable",
      model_attempted: false,
      model_success: false,
      shadow_only: true,
      auto_send_allowed: false,
      customer_copy_changed: false,
    };
  }

  const modeled = await modelUnderstanding({ env, history, event, fetchImpl });
  const fallback = modeled?.ok ? null : fallbackUnderstanding({ history, event });
  return {
    enabled: true,
    ...(modeled?.ok ? modeled.result : fallback),
    model_attempted: modeled?.attempted === true,
    model_success: modeled?.ok === true,
    model_failure_reason: modeled?.ok ? "" : text(modeled?.reason, 80),
    shadow_only: true,
    auto_send_allowed: false,
    customer_copy_changed: false,
  };
}

export const KENJI_CONTEXTUAL_SHADOW_INTERNALS = Object.freeze({
  RELATIONS,
  TOPIC_RELATIONS,
  REFERENT_STATES,
  REFERENT_TYPES,
  CONTEXT_FIELDS,
  PRICE_DIRECTIONS,
  fallbackUnderstanding,
  normalizeModelResult,
  transcriptTurns,
});
