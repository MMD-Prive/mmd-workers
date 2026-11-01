// Preparation only: none of these opt-in variables are installed by this change.
// Owner identity must be verified out of band before configuring its SHA-256.
export function ownerContextTestRequested(env = {}) {
  return env.KENJI_LINE_OWNER_CONTEXT_TEST_ENABLED === "true" &&
    env.LINE_AUTO_REPLY_ENABLED === "false";
}

export async function ownerContextTestAllowed(env, event, runtime, now = Date.now()) {
  if (!ownerContextTestRequested(env) || env.LINE_KENJI_AI_ENABLED !== "true" ||
      env.LINE_KENJI_MODEL_ENABLED !== "false" ||
      env.LINE_FIRST_CONTACT_ENABLED !== "false" ||
      env.KENJI_LINE_CONTINUITY_ENABLED !== "true" ||
      env.KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED !== "false" ||
      env.LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED !== "true" ||
      runtime?.ok !== true || runtime.controls?.all_kenji_mutations !== false ||
      runtime.controls?.line_oa_auto_reply !== false ||
      runtime.controls?.model_keyword_auto_reply !== true) return false;
  const expected = env.KENJI_LINE_OWNER_CONTEXT_TEST_OWNER_SHA256;
  const start = Date.parse(env.KENJI_LINE_OWNER_CONTEXT_TEST_STARTS_AT || "");
  const end = Date.parse(env.KENJI_LINE_OWNER_CONTEXT_TEST_EXPIRES_AT || "");
  if (!/^[a-f0-9]{64}$/.test(expected || "") || !Number.isFinite(start) ||
      !Number.isFinite(end) || now < start || now >= end || end <= start ||
      end - start > 30 * 60 * 1000) return false;
  // Only a source from the already signature-verified LINE event is eligible.
  if (event?.type !== "message" || event.message?.type !== "text" ||
      event.source?.type !== "user" || event.mode !== "active" ||
      event.deliveryContext?.isRedelivery === true || !event.replyToken ||
      !/^U[a-f0-9]{32}$/.test(event.source.userId || "")) return false;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(event.source.userId));
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  return actual === expected;
}
