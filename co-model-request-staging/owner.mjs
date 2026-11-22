import {handleCoModelOwner} from '../admin-worker/src/co-model-owner.js';
import {createCredentialBoundAdminSession, readCredentialBoundAdminActor} from '../admin-worker/src/credential-bound-admin-session.js';
import {ADMIN, OWNER_PATH} from './constants.mjs';

export default {async fetch(request, env) {
  const url = new URL(request.url);
  if (url.origin !== ADMIN) return new Response(null, {status:404});
  if (!env.ADMIN_LOGIN_CREDENTIAL || !env.ADMIN_SESSION_SECRET || !env.CO_MODEL_OWNER) {
    return new Response(null, {status:503});
  }
  const runtime = {ADMIN_LOGIN_CREDENTIAL:env.ADMIN_LOGIN_CREDENTIAL,
    ADMIN_SESSION_SECRET:env.ADMIN_SESSION_SECRET, CO_MODEL_OWNER:env.CO_MODEL_OWNER};
  const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'};
  if (url.pathname === '/qa/login') {
    if (request.method === 'GET') return new Response(
      '<!doctype html><h1>MY CO MODEL · Owner Staging</h1><form method="post"><label>รหัส Owner <input name="credential" type="password" autocomplete="current-password" required></label><button>เข้าสู่ระบบ</button></form>',
      {headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    if (request.method !== 'POST' || request.headers.get('origin') !== ADMIN) return new Response(null,{status:403,headers});
    const data = await request.formData().catch(()=>null);
    const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(runtime.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
    const credential = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(runtime.ADMIN_LOGIN_CREDENTIAL));
    if (!await crypto.subtle.verify('HMAC',key,credential,new TextEncoder().encode(String(data?.get('credential') || '')))) return new Response(null,{status:401,headers});
    const session = await createCredentialBoundAdminSession(request,{id:'fixture-owner',role:'owner'},runtime);
    return new Response(null,{status:303,headers:{...headers,Location:OWNER_PATH,
      'Set-Cookie':'mmd_admin_gate_v1='+session+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800'}});
  }
  if (url.pathname !== OWNER_PATH && url.pathname !== '/internal/admin/console') return new Response(null,{status:404,headers});
  const actor = await readCredentialBoundAdminActor(request,runtime);
  if (!actor) return new Response(null,{status:303,headers:{...headers,Location:'/qa/login'}});
  if (url.pathname === '/internal/admin/console' && request.method === 'GET') return new Response(
    '<!doctype html><h1>Owner Staging</h1><a href="'+OWNER_PATH+'">MY CO MODEL · ออกลิงก์คำขอ</a>',
    {headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  if (url.pathname !== OWNER_PATH) return new Response(null,{status:405,headers});
  return handleCoModelOwner(request,runtime,actor);
}};
