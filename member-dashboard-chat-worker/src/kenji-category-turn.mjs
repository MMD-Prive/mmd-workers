import {approvedCategoryReply, withCategoryReplyGrant, membershipUriButton} from './kenji-reply-category-gate.mjs';
import {careBackOctoberReply} from './kenji-care-back-october.mjs';
import {lineIntakeCommand, readLineIntakeCatalog, resolveLineIntakeReply} from './kenji-line-intake-commands.mjs';
import {resolveKenjiLineLiveTruth} from './kenji-line-live-truth.mjs';
import {resolveMembershipStatusReply} from './kenji-membership-status-reply.mjs';

export async function runApprovedCategoryTurn(env, event, initialRuntime, io) {
  const now = io.now ?? Date.now();
  const token = String(event?.replyToken || '').trim();
  const age = now - Number(event?.timestamp);
  const silent = {text:'', intent:'note_only', reply_source:'category_silent', guard_blocked:true, guard_reason:'category_no_approved_reply'};
  const controls = initialRuntime?.controls || {};
  let decision = silent, attempted = false, result = null;
  const eligible = initialRuntime?.ok === true && controls.all_kenji_mutations !== true && controls.line_oa_auto_reply !== true &&
    /^(true|1|yes|on)$/i.test(String(env.LINE_AUTO_REPLY_ENABLED)) && /^(true|1|yes|on)$/i.test(String(env.LINE_KENJI_AI_ENABLED)) &&
    event?.source?.type === 'user' && /^U[a-f0-9]{32}$/i.test(event.source.userId || '') &&
    String(event.mode).toLowerCase() !== 'standby' && !event.deliveryContext?.isRedelivery && token &&
    Number.isFinite(age) && age >= -60000 && age <= 300000;
  if (!eligible) {
    const reason = initialRuntime?.ok !== true ? 'category_initial_runtime_unavailable' :
      controls.all_kenji_mutations === true || controls.line_oa_auto_reply === true ? 'category_initial_kill_switch' :
      !(/^(true|1|yes|on)$/i.test(String(env.LINE_AUTO_REPLY_ENABLED)) && /^(true|1|yes|on)$/i.test(String(env.LINE_KENJI_AI_ENABLED))) ? 'category_initial_disabled' :
      'category_event_ineligible';
    decision = {...silent, guard_reason:reason};
  }
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
        if (continuity?.available !== true) { decision = {...silent, guard_reason:'category_continuity_unavailable'}; return {decision,attempted,delivered:false,deliveryStatus:null}; }
        if (runtime?.ok !== true) { decision = {...silent, guard_reason:'category_fresh_runtime_unavailable'}; return {decision,attempted,delivered:false,deliveryStatus:null}; }
        if (
            runtime.controls?.all_kenji_mutations === true || runtime.controls?.line_oa_auto_reply === true ||
            owner?.ok !== true || owner.active === true) { decision = {...silent, guard_reason:owner?.active === true ? 'category_owner_takeover' : owner?.ok !== true ? 'category_owner_unavailable' : 'category_fresh_kill_switch'}; return {decision,attempted,delivered:false,deliveryStatus:null}; }
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
    } catch { decision = {...silent, guard_reason:'category_resolution_exception'}; }
    if (decision.text) {
      try {
        // Never reuse stale conversational identity or a previous runtime result.
        const continuity = await io.continuity();
        const [runtime, owner] = await Promise.all([io.runtime(),io.owner(continuity)]);
        if (runtime?.ok === true && runtime.controls?.all_kenji_mutations !== true && runtime.controls?.line_oa_auto_reply !== true &&
            continuity?.available === true && owner?.ok === true && owner.active !== true) {
          attempted = true;
          const button = membershipUriButton(decision);
          result = await io.send(withCategoryReplyGrant(env,token,decision),token,decision.text,button);
          if (result?.ok !== true) decision = {...decision,guard_reason:transportReason(result)};
        } else decision = {...decision,guard_reason:continuity?.available !== true ? 'category_continuity_unavailable' : runtime?.ok !== true ? 'category_fresh_runtime_unavailable' : owner?.active === true ? 'category_owner_takeover' : owner?.ok !== true ? 'category_owner_unavailable' : 'category_fresh_kill_switch'};
      } catch { decision = {...decision,guard_reason:attempted ? 'category_transport_exception' : 'category_gate_exception'}; }
    }
  }
  return {decision,attempted,delivered:result?.ok === true,deliveryStatus:result?.status ?? null};
}

function transportReason(result) {
  if (result?.suppressed === true || result?.error === 'reply_category_silent') return 'category_transport_suppressed';
  if (result?.error === 'reply_not_configured') return 'category_transport_unconfigured';
  if (result?.error === 'line_reply_request_failed') return 'category_transport_request_failed';
  return 'category_transport_failed';
}
