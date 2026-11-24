// QA fixtures. All actors must come from verified QA sessions or the agent harness.
export const cases = Object.freeze({
  mek: Object.freeze({group:'Premium',model:'Mek',modelId:'qa-model-mek',source:'historical_template',templateDate:'2026-09-13'}),
  uri: Object.freeze({group:'GWs19',model:'Uri',modelId:'qa-model-uri',source:'new_request',through:'Kendo'}),
});

const privateHeaders = {'Cache-Control':'private, no-store'};
function reply(status, data) { return Response.json(data, {status,headers:privateHeaders}); }
function id(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value); }
async function reference(client, requestId) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['private-qa-v1',client,requestId])));
  return 'privateqa_'+Array.from(new Uint8Array(bytes), byte=>byte.toString(16).padStart(2,'0')).join('');
}
const validRef = /^privateqa_[0-9a-f]{64}$/;
const bookingPrefix = 'private-qa/v1/booking/';
const jobPrefix = 'private-qa/v1/job/';
const bookingKey = ref => bookingPrefix+ref;
const jobKey = ref => jobPrefix+ref;
const read = async (store,key) => (await store.get(key))?.json();
const insert = (store,key,row) => store.put(key,JSON.stringify(row),{onlyIf:{etagDoesNotMatch:'*'}});

async function listVisible(store, prefix, visible) {
  const rows = [];
  let cursor;
  do {
    const page = await store.list({prefix, cursor});
    for (const object of page.objects) {
      const row = await read(store,object.key);
      if (visible(row)) rows.push(row);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return rows;
}

function requestView({ref,clientId,model,group,source,templateDate,through}) {
  return {booking_ref:ref,client_id:clientId,model,group,source,templateDate,through};
}

function jobView({ref,session_id,model,group,status}) {
  return {booking_ref:ref,session_id,model,group,status};
}

export function privateBookingQa({store, authorize}) {
  return async function handle(request) {
    const {pathname,searchParams,origin} = new URL(request.url);
    const actor = await authorize(request);
    if (!actor || !id(actor.id)) return reply(401,{error:'qa_session_required'});
    if (request.method === 'POST' && request.headers.get('origin') !== origin) return reply(403,{error:'origin_required'});
    if (request.method === 'POST' && pathname === '/qa/private-booking/requests') {
      if (actor.role !== 'customer' || actor.privateAllowed !== true) return reply(403,{error:'private_access_required'});
      const body = await request.json().catch(()=>null);
      const fixture = Object.hasOwn(cases,body?.scenario) ? cases[body.scenario] : null;
      if (!fixture || !id(body?.request_id) || Object.keys(body).some(key => !['scenario','request_id'].includes(key))) return reply(400,{error:'invalid_request'});
      const ref = await reference(actor.id, body.request_id);
      const booking = {ref, lane:'private', clientId:actor.id, scenario:body.scenario, ...fixture};
      const created = Boolean(await insert(store,bookingKey(ref),booking));
      const stored = created ? booking : await read(store,bookingKey(ref));
      if (!stored) return reply(503,{error:'booking_unavailable'});
      if (stored.clientId !== actor.id || stored.scenario !== body.scenario) return reply(409,{error:'request_conflict'});
      return reply(created?201:200,{booking_ref:ref,created,status:'pending_review'});
    }
    if (request.method === 'GET' && pathname === '/qa/private-booking/requests') {
      if (actor.role !== 'owner') return reply(403,{error:'owner_required'});
      const clientId = searchParams.get('client_id');
      if (!id(clientId)) return reply(400,{error:'invalid_request'});
      const bookings = await listVisible(store,bookingPrefix,booking => booking?.lane === 'private' && booking.clientId === clientId);
      return reply(200,{requests:bookings.map(requestView)});
    }
    if (request.method === 'POST' && pathname === '/qa/private-booking/create-job') {
      if (actor.role !== 'owner') return reply(403,{error:'owner_required'});
      const body = await request.json().catch(()=>null);
      if (!validRef.test(body?.booking_ref ?? '') || !id(body?.client_id)) return reply(400,{error:'invalid_request'});
      const booking = await read(store,bookingKey(body.booking_ref));
      if (!booking || booking.clientId !== body.client_id || booking.lane !== 'private') return reply(404,{error:'booking_not_found'});
      const job = {...booking,session_id:'job_'+booking.ref,status:'offered'};
      const created = Boolean(await insert(store,jobKey(booking.ref),job));
      const stored = created ? job : await read(store,jobKey(booking.ref));
      if (!stored) return reply(503,{error:'job_unavailable'});
      if (stored.ref !== booking.ref || stored.clientId !== booking.clientId || stored.lane !== 'private') {
        return reply(409,{error:'job_conflict'});
      }
      return reply(created?201:200,{booking_ref:stored.ref,session_id:stored.session_id,created});
    }
    if (request.method === 'GET' && ['/qa/private-booking/model-jobs','/qa/private-booking/my-jobs'].includes(pathname)) {
      const isModel = pathname.endsWith('/model-jobs');
      if (isModel ? actor.role !== 'model' : actor.role !== 'customer' || actor.privateAllowed !== true) {
        return reply(403,{error:'access_required'});
      }
      const visible = job => job?.lane === 'private' && (isModel ? job.modelId === actor.id : job.clientId === actor.id);
      const ref = searchParams.get('booking_ref');
      if (ref === null) {
        const jobs = await listVisible(store,jobPrefix,visible);
        return reply(200,{jobs:jobs.map(jobView)});
      }
      if (!validRef.test(ref)) return reply(400,{error:'invalid_reference'});
      const job = await read(store,jobKey(ref));
      return reply(200,{jobs:visible(job)?[jobView(job)]:[]});
    }
    return reply(404,{error:'not_found'});
  };
}
