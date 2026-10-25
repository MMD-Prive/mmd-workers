import { BLACKCARD_POLICY, BLACKCARD_INTERNAL_PATH } from '../shared/blackcard-policy.mjs';
import { PERSONAL_MAINS, personalMain } from '../shared/personal-main-catalog.mjs';
import { withPaymentEvidenceLock } from '../shared/canonical-payment-evidence.mjs';
import { formulaValue, constantTimeEqual, httpError } from './lib/payment-primitives.js';
import { stablePaymentRef, mintCustomerToken } from './unified-payment-proof.js';
import { parseMarkedJson } from './confirmation-details.js';
import { replaceMarker } from './blackcard-companion-preference.js';

const MARKER = 'MMD BLACK CARD COMPANION PREFERENCE V1';
const F = Object.freeze({ id:'fldLTq2kZbyRv22IA', ref:'fldojgjSQLaO0uQLX', amount:'fldhwC79ndbnEXSZz', note:'fldEcDkF7CH9VixWM' });
const clean = v => String(v ?? '').trim();
const norm = v => clean(v).toLowerCase().replace(/[\s-]+/g, '_');
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control':'no-store, private', 'x-mmd-payment-authority':'payments-worker' } });
const table = (env, kind) => ({ clients:env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || 'tblVv58TCbwh5j1fS', sessions:env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || 'tblC98mKWbzmPuNzX', payments:env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || 'tblWGGJJOx5eBvBZJ', proofs:env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || 'tblfJfM4Sqag9zrLi' })[kind];

async function airtable(env, kind, suffix = '', init = {}) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw httpError(503, 'blackcard_storage_unavailable');
  const req = new Request(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table(env, kind))}${suffix}`, {
    ...init, headers: { authorization:`Bearer ${env.AIRTABLE_API_KEY}`, 'content-type':'application/json' },
  });
  const res = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(req) : fetch(req));
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw httpError(503, 'blackcard_storage_unavailable');
  return data;
}
async function rows(env, kind, formula, byId = false) {
  const query = new URLSearchParams({ filterByFormula:formula, maxRecords:'2', ...(byId ? {returnFieldsByFieldId:'true'} : {}) });
  const data = await airtable(env, kind, '?' + query);
  if (!Array.isArray(data.records) || data.offset) throw httpError(503, 'blackcard_lookup_incomplete');
  return data.records;
}
async function unique(env, kind, formula, byId = false) {
  const found = await rows(env, kind, formula, byId);
  if (found.length > 1) throw httpError(409, 'blackcard_identity_ambiguous');
  return found[0] || null;
}
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function paymentState(payment, proofs) {
  const f = payment?.fields || {};
  const status = norm(f['Payment Status'] || f.payment_status || f.fldEJ1hmm7KwWuI6q);
  const verification = norm(f['Verification Status'] || f.verification_status || f.fldJ7a0Ube9F0bmRy);
  if (['cancelled','canceled','refunded','void','rejected'].includes(status)) return 'closed';
  if (['paid','verified','completed'].includes(status) && ['verified','official_verified','approved'].includes(verification)) return 'verified';
  const intent = norm(f['Payment Intent Status'] || f.payment_intent_status || f.fld04fr3bRJTohO6y);
  if (proofs.some(p=>['submitted','pending','pending_review','pending_verification','under_review','matched','verified','approved'].includes(norm(p.fields?.status || p.fields?.verification_status))) || ['evidence_received','proof_received','manual_slip_evidence_received'].includes(intent)) return 'pending_verification';
  return 'awaiting_payment';
}
function assertPayment(payment, sessionId, ref) {
  const f = payment?.fields || {};
  if (!payment?.id || clean(f.session_id || f['Session ID'] || f.fld2wdhBvc8xrV6y5) !== sessionId
    || clean(f['Payment Reference'] || f.payment_ref || f.fldOO6SY49iDw8VBZ) !== ref
    || !['black_card','blackcard'].includes(norm(f['Package Code'] || f.package_code))
    || norm(f.payment_stage || f.fldrr9g8ZZjqAbdKQ) !== 'membership'
    || Number(f.amount_thb ?? f.Amount ?? f['Amount (THB no decimals)'] ?? f.fldvCSwrUW8OMAooS) !== BLACKCARD_POLICY.amount_thb) throw httpError(409, 'blackcard_payment_subject_mismatch');
}
async function existingAccountPayment(env,clientId) {
  let offset = '', matches = [];
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({filterByFormula:"OR({Package Code}='black_card',{Package Code}='blackcard')",pageSize:'100',...(offset?{offset}:{})});
    const data = await airtable(env,'payments','?'+query);
    if (!Array.isArray(data.records)) throw httpError(503,'blackcard_lookup_incomplete');
    matches.push(...data.records.filter(row=>row.fields?.Client?.includes(clientId)));
    if (matches.length>1) throw httpError(409,'blackcard_existing_orders_require_review');
    offset=data.offset || '';
    if (!offset) return matches[0] || null;
  }
  throw httpError(503,'blackcard_lookup_incomplete');
}
function internalRequest(path, body) {
  return new Request('https://payments.internal' + path, { method:'POST', headers:{'content-type':'application/json',origin:'https://mmdbkk.com'}, body:JSON.stringify(body) });
}

// Service-only: LINE identity is supplied by the authenticated member BFF.
// The R2 CAS lease serializes retry/double-click writes for this account.
export async function handleBlackCardMemberPayment(request, env, adapters) {
  if (new URL(request.url).pathname !== BLACKCARD_INTERNAL_PATH) return json({ok:false},404);
  const expected = clean(env.AUTH_SERVICE_MEMBER_TO_PAYMENTS);
  if (!expected || !await constantTimeEqual(request.headers.get('x-internal-token'), expected)) return json({ok:false,error:'service_auth_required'},401);
  if (request.method !== 'POST') return json({ok:false},405);
  try {
    const multipart = (request.headers.get('content-type') || '').includes('multipart/form-data');
    const form = multipart ? await request.formData() : null;
    const body = multipart ? Object.fromEntries(form) : await request.json();
    if (!body || Array.isArray(body) || Object.keys(body).some(k=>!['line_user_id','action','companion_id','file'].includes(k))) throw httpError(400,'blackcard_request_invalid');
    const line = clean(body.line_user_id), action = clean(body.action);
    if (!/^U[0-9a-f]{32}$/i.test(line) || !['read','start','select','instructions','evidence'].includes(action)) throw httpError(400,'blackcard_request_invalid');
    if (action === 'select' && !personalMain(body.companion_id)) throw httpError(400,'invalid_companion');
    if (multipart !== (action === 'evidence')) throw httpError(400,'blackcard_request_invalid');
    const operation = async () => {
      const clientFormula = `{line_user_id}='${formulaValue(line)}'`;
      let client = await unique(env,'clients',clientFormula);
      if (!client && action === 'start') {
        // Verified LINE identity only; never infer membership or a historic client.
        const created = await airtable(env,'clients','',{method:'PATCH',body:JSON.stringify({performUpsert:{fieldsToMergeOn:['line_user_id']},records:[{fields:{line_user_id:line}}]})});
        client = created.records?.[0];
      }
      if (!client) return json({ok:true,...BLACKCARD_POLICY,status:'not_started',companion:null,companions:PERSONAL_MAINS});
      if (!/^rec[A-Za-z0-9]{14}$/.test(client.id)) throw httpError(409,'canonical_client_required');
      const previous = await existingAccountPayment(env,client.id);
      const previousFields = previous?.fields || {};
      const sessionId = previous ? clean(previousFields.session_id || previousFields['Session ID'] || previousFields.fld2wdhBvc8xrV6y5) : 'bcard_' + (await digest(client.id + ':black_card:v1')).slice(0,24);
      const ref = previous ? clean(previousFields['Payment Reference'] || previousFields.payment_ref || previousFields.fldOO6SY49iDw8VBZ) : await stablePaymentRef(sessionId,'membership');
      if (!sessionId || !ref) throw httpError(409,'blackcard_existing_order_incomplete');
      const formula = `{session_id}='${formulaValue(sessionId)}'`;
      let session = await unique(env,'sessions',formula,true);
      if (!session && previous) throw httpError(409,'blackcard_existing_order_incomplete');
      if (!session && action === 'start') {
        const created = await airtable(env,'sessions','?returnFieldsByFieldId=true',{method:'PATCH',body:JSON.stringify({performUpsert:{fieldsToMergeOn:['session_id']},records:[{fields:{[F.id]:sessionId,[F.ref]:ref,[F.amount]:BLACKCARD_POLICY.amount_thb,[F.note]:'MMD Black Card membership · 35000 THB · 3 years\nsource=my_mmd_blackcard;official_verify_required=true',Client:[client.id]}}]})});
        session = created.records?.[0];
      }
      if (!session) return json({ok:true,...BLACKCARD_POLICY,status:'not_started',companion:null,companions:PERSONAL_MAINS});
      // Resolve Client by name too: returnFieldsByFieldId returns the linked field ID.
      const named = await unique(env,'sessions',formula);
      if (named?.fields?.Client?.length !== 1 || named.fields.Client[0] !== client.id || clean(session.fields?.[F.id]) !== sessionId || clean(session.fields?.[F.ref]) !== ref || (!previous && !/MMD Black Card membership/.test(session.fields?.[F.note] || ''))) throw httpError(403,'blackcard_session_owner_mismatch');
      let payment = await unique(env,'payments',`{Payment Reference}='${formulaValue(ref)}'`);
      if (!payment && action === 'start') {
        // Existing production Package Code select is "blackcard". The public
        // API keeps canonical black_card; no select option/typecast is needed.
        const intent = await adapters.intent(internalRequest('/v1/pay/verify',{session_id:sessionId,payment_ref:ref,payment_stage:'membership',package_code:'blackcard',amount:BLACKCARD_POLICY.amount_thb,notes:'MMD Black Card membership;source=my_mmd_blackcard;official_verify_required=true'}));
        const data = await intent.json().catch(()=>null);
        if (!intent.ok || data?.ok !== true || data.payment_ref !== ref || data.session_id !== sessionId || data.unified_payment_flow !== 'v1') throw httpError(503,'blackcard_intent_failed');
        payment = await unique(env,'payments',`{Payment Reference}='${formulaValue(ref)}'`);
      }
      if (!payment) throw httpError(409,'blackcard_intent_incomplete');
      assertPayment(payment,sessionId,ref);
      if (!payment.fields.Client?.length && action === 'start') {
        await airtable(env,'payments','/'+payment.id,{method:'PATCH',body:JSON.stringify({fields:{Client:[client.id]}})});
        payment.fields.Client=[client.id];
      }
      if (payment.fields.Client?.length !== 1 || payment.fields.Client[0] !== client.id) throw httpError(403,'blackcard_payment_owner_mismatch');
      const proofs = await rows(env,'proofs',`{payment_ref}='${formulaValue(ref)}'`);
      const status = paymentState(payment,proofs);
      const eligible = ['pending_verification','verified'].includes(status);
      let preference = parseMarkedJson(session.fields?.[F.note],MARKER);
      const current = personalMain(preference?.companion_id);
      if (action === 'select') {
        if (!eligible) throw httpError(409,'payment_evidence_required');
        const companion = personalMain(body.companion_id);
        if (current?.id !== companion.id) {
          preference = {schema:1,companion_id:companion.id,source:'my_mmd_blackcard',updated_at:new Date().toISOString(),payment_status_at_selection:status};
          await airtable(env,'sessions','/'+session.id,{method:'PATCH',body:JSON.stringify({fields:{[F.note]:replaceMarker(session.fields[F.note],preference)}})});
        }
      }
      const companion = personalMain(preference?.companion_id);
      const result = {ok:true,schema:'mmd_blackcard_member_v1',...BLACKCARD_POLICY,status,session_id:sessionId,payment_ref:ref,can_choose_companion:eligible,companion,companions:PERSONAL_MAINS,preference_status:companion ? (status === 'verified' ? 'selected_verified_pending_entitlement' : 'selected_pending_verification') : 'not_selected'};
      if (['instructions','evidence'].includes(action)) {
        if (status !== 'awaiting_payment') return json(result);
        const t = await mintCustomerToken(env,{session_id:sessionId,payment_ref:ref,payment_type:'membership'});
        if (action === 'instructions') {
          const response = await adapters.instructions(internalRequest('/v1/confirm/payment-instructions',{t,expected_role:'customer'}));
          const data = await response.json().catch(()=>null);
          if (!response.ok || data?.ok !== true || data.available !== true || data.amount_due_thb !== BLACKCARD_POLICY.amount_thb) throw httpError(503,'blackcard_instructions_unavailable');
          return json({...result,instructions:data.instructions});
        }
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1 || file.size > 10*1024*1024 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw httpError(400,'invalid_slip_file');
        const proof = new FormData(); proof.set('file',file); proof.set('t',t); proof.set('expected_role','customer'); proof.set('source_page','member_payments'); proof.set('payment_ref',ref); proof.set('session_id',sessionId); proof.set('payment_stage','membership');
        const evidence = await adapters.evidence(new Request('https://payments.internal/v1/pay/slip/evidence',{method:'POST',headers:{origin:'https://mmdbkk.com'},body:proof}));
        const data = await evidence.json().catch(()=>null);
        if (!evidence.ok || data?.ok !== true || data.evidence_submitted !== true || !data.proof_id || data.unified_payment_flow !== 'v1') throw httpError(503,'blackcard_evidence_not_confirmed');
        return json({...result,status:'pending_verification',can_choose_companion:true,evidence_submitted:true});
      }
      return json(result);
    };
    // Reads/instructions never mutate purchase or preference state.
    return ['read','instructions'].includes(action) ? await operation() : await withPaymentEvidenceLock(env.PAYMENT_SLIP_EVIDENCE,'blackcard-account:'+await digest(line),operation);
  } catch (error) { return json({ok:false,error:clean(error.message)},Number(error.status)||503); }
}
