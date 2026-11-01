import { readMemberAppSession } from './member-app-api.js';
import { BLACKCARD_API_ROOT, BLACKCARD_INTERNAL_PATH } from '../../shared/blackcard-policy.mjs';

const ORIGINS = new Set(['https://mmdbkk.com','https://www.mmdbkk.com']);
const ACTIONS = Object.freeze({state:'read',purchase:'start',companion:'select',instructions:'instructions',evidence:'evidence'});
const EXCLUSIVE = Object.freeze({hito:'hito.webp',hiei:'hiei.webp',hima:'hima.webp',hiro:'hiro.webp'});
const json = (body,status=200) => Response.json(body,{status,headers:{'cache-control':'no-store, private'}});
export function isBlackCardPaymentPath(input) {
  const url = input instanceof URL ? input : new URL(input);
  return url.pathname.startsWith(BLACKCARD_API_ROOT+'/');
}
export async function handleBlackCardPayment(request, env, readSession = readMemberAppSession) {
  const url = new URL(request.url);
  const exclusiveId = /^\/member\/api\/liff\/blackcard\/exclusive\/([a-z]+)$/.exec(url.pathname)?.[1];
  const action = ACTIONS[url.pathname.slice(BLACKCARD_API_ROOT.length+1)];
  if (!action && !Object.hasOwn(EXCLUSIVE,exclusiveId)) return json({ok:false,error:{code:'NOT_FOUND'}},404);
  const expectedMethod = exclusiveId || ['read','instructions'].includes(action) ? 'GET' : 'POST';
  if (request.method !== expectedMethod) return json({ok:false,error:{code:'METHOD_NOT_ALLOWED'}},405);
  if (url.search || request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && !ORIGINS.has(request.headers.get('origin')))) return json({ok:false,error:{code:'BROWSER_PAYMENT_AUTHORITY_REJECTED'}},403);
  const session = await readSession(request,env);
  if (!session?.lineUserId || session.readGraceOnly) return json({ok:false,auth_required:true,error:{code:'LINE_SESSION_REQUIRED'}},401);
  if (!env.PAYMENTS_WORKER?.fetch || !env.AUTH_SERVICE_MEMBER_TO_PAYMENTS) return json({ok:false,error:{code:'BLACKCARD_PAYMENT_UNAVAILABLE'}},503);
  try {
    if (exclusiveId) {
      // Payment truth stays with payments-worker. Never expose R2 keys or signed
      // URLs to the browser; the image bytes pass through this authenticated BFF.
      const response = await env.PAYMENTS_WORKER.fetch(new Request('https://payments.internal'+BLACKCARD_INTERNAL_PATH,{
        method:'POST',headers:{'x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS,'content-type':'application/json'},
        body:JSON.stringify({line_user_id:session.lineUserId,action:'read'}),signal:AbortSignal.timeout(15000),
      }));
      const data = await response.json().catch(()=>null);
      if (!response.ok || data?.ok !== true) return json({ok:false,error:{code:'BLACKCARD_PAYMENT_UNAVAILABLE'}},503);
      if (data.package_code !== 'black_card' || data.status !== 'verified' || !data.session_id || !data.payment_ref) return json({ok:false,error:{code:'EXCLUSIVE_NOT_AVAILABLE'}},403);
      if (!env.PRIVATE_MODEL_MEDIA?.get) return json({ok:false,error:{code:'PRIVATE_MEDIA_UNAVAILABLE'}},503);
      const object = await env.PRIVATE_MODEL_MEDIA.get('blackcard/exclusive/'+EXCLUSIVE[exclusiveId]);
      if (!object?.body || object.httpMetadata?.contentType !== 'image/webp') return json({ok:false,error:{code:'EXCLUSIVE_NOT_AVAILABLE'}},404);
      return new Response(object.body,{headers:{'content-type':'image/webp','cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'}});
    }
    let body;
    const headers = new Headers({'x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS});
    if (action === 'evidence') {
      const size = Number(request.headers.get('content-length'));
      if (size > 11*1024*1024) return json({ok:false,error:{code:'SLIP_TOO_LARGE'}},413);
      const input = await request.formData();
      if ([...input.keys()].some(k=>k!=='file') || input.getAll('file').length!==1) return json({ok:false,error:{code:'BROWSER_PAYMENT_AUTHORITY_REJECTED'}},400);
      const file = input.get('file');
      if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1 || file.size > 10*1024*1024 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) return json({ok:false,error:{code:'INVALID_SLIP_FILE'}},400);
      body = new FormData(); body.set('file',file); body.set('line_user_id',session.lineUserId); body.set('action',action);
    } else {
      const input = request.method === 'POST' ? await request.json() : {};
      if (!input || Array.isArray(input) || Object.keys(input).some(k=>action!=='select' || k!=='companion_id')) return json({ok:false,error:{code:'BROWSER_PAYMENT_AUTHORITY_REJECTED'}},400);
      headers.set('content-type','application/json');
      body = JSON.stringify({line_user_id:session.lineUserId,action,...(action==='select' ? {companion_id:input.companion_id} : {})});
    }
    const response = await env.PAYMENTS_WORKER.fetch(new Request('https://payments.internal'+BLACKCARD_INTERNAL_PATH,{method:'POST',headers,body,signal:AbortSignal.timeout(action==='evidence'?90000:15000)}));
    const data = await response.json().catch(()=>null);
    if (!response.ok || data?.ok !== true) return json({ok:false,error:{code:typeof data?.error==='string'?data.error:'BLACKCARD_PAYMENT_UNAVAILABLE'}},response.ok?503:response.status);
    if (data.package_code!=='black_card' || data.entitlement_granted!==false) return json({ok:false,error:{code:'BLACKCARD_CONTRACT_INVALID'}},503);
    // No service credential, customer token or LINE identity is returned.
    return json(data);
  } catch { return json({ok:false,error:{code:'BLACKCARD_PAYMENT_UNAVAILABLE'}},503); }
}
