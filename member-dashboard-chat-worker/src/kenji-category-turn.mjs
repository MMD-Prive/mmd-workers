import {approvedCategoryReply, withCategoryReplyGrant} from './kenji-reply-category-gate.mjs';
import {approvedPublicQa} from './kenji-approved-public-qa.mjs';
import {careBackOctoberReply} from './kenji-care-back-october.mjs';

export async function runApprovedCategoryTurn(env, event, initialRuntime, io) {
  const now = io.now ?? Date.now();
  const token = String(event?.replyToken || '').trim();
  const age = now - Number(event?.timestamp);
  const silent = {text:'', intent:'note_only', reply_source:'category_silent', guard_blocked:true};
  const controls = initialRuntime?.controls || {};
  let decision = silent, attempted = false, result = null;
  const eligible = initialRuntime?.ok === true && controls.all_kenji_mutations !== true && controls.line_oa_auto_reply !== true &&
    /^(true|1|yes|on)$/i.test(String(env.LINE_AUTO_REPLY_ENABLED)) && /^(true|1|yes|on)$/i.test(String(env.LINE_KENJI_AI_ENABLED)) &&
    event?.source?.type === 'user' && /^U[a-f0-9]{32}$/i.test(event.source.userId || '') &&
    String(event.mode).toLowerCase() !== 'standby' && !event.deliveryContext?.isRedelivery && token &&
    Number.isFinite(age) && age >= -60000 && age <= 300000;
  if (eligible) {
    decision = approvedCategoryReply(event,env,{ownerFaq:approvedPublicQa,careBackOctoberReply,now}) || silent;
    if (decision.text) {
      try {
        // Never reuse stale conversational identity or a previous runtime result.
        const continuity = await io.continuity();
        const [runtime, owner] = await Promise.all([io.runtime(),io.owner(continuity)]);
        if (runtime?.ok === true && runtime.controls?.all_kenji_mutations !== true && runtime.controls?.line_oa_auto_reply !== true &&
            continuity?.available === true && owner?.ok === true && owner.active !== true) {
          attempted = true;
          result = await io.send(withCategoryReplyGrant(env,token,decision),token,decision.text);
        }
      } catch { /* Fail closed; no alternate reply or model fallback. */ }
    }
  }
  return {decision,attempted,delivered:result?.ok === true,deliveryStatus:result?.status ?? null};
}
