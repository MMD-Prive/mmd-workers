import {WorkerEntrypoint} from 'cloudflare:workers';
import worker, {CoModelOwnerService as Service, verifyPartnerTokenFromRequest} from '../partners-worker/src/index.ts';
export {CoModelIntakeObject} from '../partners-worker/src/co-model-intake-object.ts';
import {PARTNER} from './constants.mjs';

const ids = ['recAAAAAAAAAAAAAA','recBBBBBBBBBBBBBB'];
async function fixture(env) {
  if (!env.CO_MODEL_INTAKE || !env.TOKEN_SECRET || !env.QA_PARTNER_A_TOKEN || !env.QA_PARTNER_B_TOKEN) throw Error('fixture_bindings_required');
  const records = await Promise.all(ids.map(async (id,i)=>{
    const token = i ? env.QA_PARTNER_B_TOKEN : env.QA_PARTNER_A_TOKEN;
    const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    return {id,fields:{fldpJWfASq7PfkMgC:'Fixture Partner '+(i?'B':'A'),
      fldajmg66pf2ifGPu:'Active',fldwRzdtIoPbHKr7n:'recognized',fldoaCF4k4YqyuQ7Q:hash}};
  }));
  return {TOKEN_SECRET:env.TOKEN_SECRET, CO_MODEL_INTAKE:env.CO_MODEL_INTAKE,
    AIRTABLE_BASE_ID:'fixture', AIRTABLE_API_KEY:'fixture', AIRTABLE_TABLE_MODEL_PARTNERS:'Partners',
    async fixtureFetch(input, init) {
      const url = new URL(input);
      if (init.method !== 'GET' || url.origin !== 'https://api.airtable.com') throw Error('fixture_transport_denied');
      if (url.pathname === '/v0/fixture/Partners') return Response.json({records});
      const record = records.find(row=>url.pathname === '/v0/fixture/Partners/'+row.id);
      return record ? Response.json(record) : Response.json({}, {status:404});
    }};
}
export class CoModelOwnerService extends WorkerEntrypoint {
  async recipients() { return new Service(this.ctx,await fixture(this.env)).recipients(); }
  async issue(id,draft) { return new Service(this.ctx,await fixture(this.env)).issue(id,draft); }
}
export default {async fetch(request,env,ctx) {
  const url = new URL(request.url);
  if (url.origin !== PARTNER || url.pathname !== '/partner/dashboard/co-model-request') return new Response(null,{status:404});
  let runtime;
  try { runtime = await fixture(env); } catch { return new Response(null,{status:503}); }
  // Fixture accounts use the original signature, expiry, stored hash and status checks.
  const auth = await verifyPartnerTokenFromRequest(request,runtime);
  if (!auth.ok) return auth.response;
  return worker.fetch(request,runtime,ctx);
}};
