import {approvedCategoryReply, withCategoryReplyGrant} from './kenji-reply-category-gate.mjs';
import {careBackOctoberReply} from './kenji-care-back-october.mjs';
import {lineIntakeCommand, readLineIntakeCatalog, resolveLineIntakeReply} from './kenji-line-intake-commands.mjs';
import {resolveKenjiLineLiveTruth} from './kenji-line-live-truth.mjs';
import {resolveMembershipStatusReply} from './kenji-membership-status-reply.mjs';

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
    // Native OA owns Q&A. Only exact current-message commands may read truth;
    // never promote stale conversation state into a command or model request.
    const command = event.type === 'message' && event.message?.type === 'text'
      ? String(event.message.text || '').normalize('NFKC').trim().toLowerCase() : '';
    const intake = lineIntakeCommand(event);
    try {
      if (command === 'checkpts' || intake) {
        const continuity = await io.continuity();
        const [runtime, owner] = await Promise.all([io.runtime(),io.owner(continuity)]);
        if (continuity?.available !== true || runtime?.ok !== true ||
            runtime.controls?.all_kenji_mutations === true || runtime.controls?.line_oa_auto_reply === true ||
            owner?.ok !== true || owner.active === true) return {decision,attempted,delivered:false,deliveryStatus:null};
        if (command === 'checkpts') {
          const truth = await resolveKenjiLineLiveTruth({env,event,intent:'membership_status'});
          decision = {...resolveMembershipStatusReply(truth),intent:'approved_command',reply_source:'category_checkpts'};
        } else {
          const catalog = intake === 'apply' ? null : await readLineIntakeCatalog(env,event);
          const reply = resolveLineIntakeReply(event,{},catalog,now);
          decision = {text:reply.text,intent:'approved_command',reply_source:`category_${intake}`};
        }
      } else {
        decision = approvedCategoryReply(event,env,{careBackOctoberReply,now}) || silent;
      }
    } catch { decision = silent; }
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
