import {qaCustomerLinks,linkedCustomerId,subjectDigest} from './customer-identity.mjs';
import {privateSurfaces} from './surface.mjs';
import {privateBookingQa} from './worker.mjs';

const bookingOrigin = 'https://mmd-isolated-qa-staging.malemodel-bkk.workers.dev';
const adminOrigin = 'https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev';
const modelOrigin = 'https://my-model-developing-console-qa.malemodel-bkk.workers.dev';
const cookieId = /(?:^|;\s*)__Host-mmd-qa=([a-f0-9-]{36})(?:;|$)/;
const sessionKey = sessionId => 'private-qa/v1/customer-session/' + sessionId;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function privateEnabled(env) {
  return env.PRIVATE_HANDOFF_QA === 'true';
}

export async function linkVerifiedQaSession(env, sessionId, expiresAt, verifiedSubject = env.QA_LINE_SUBJECT) {
  const link = qaCustomerLinks(env).find(([subject]) => subject === verifiedSubject);
  if (link) {
    await env.QA_STORAGE.put(sessionKey(sessionId), JSON.stringify({
      id:link[1], subjectDigest:await subjectDigest(verifiedSubject), expiresAt,
    }));
  }
}

export function bookingPrivate(request, env, verifyBookingIdentity) {
  if (new URL(request.url).origin !== bookingOrigin) return null;
  return privateSurfaces({
    async authorize(req, role) {
      if (role !== 'customer' || env.QA_ENABLED !== 'true' || !privateEnabled(env)) return null;
      const sessionId = (req.headers.get('Cookie') ?? '').match(cookieId)?.[1];
      if (!sessionId) return null;
      const originalSession = await env.QA_STORAGE.get('session/' + sessionId);
      const expiresAt = Number(await originalSession?.text());
      if (!(expiresAt > Date.now())) return null;
      const session = await (await env.QA_STORAGE.get(sessionKey(sessionId)))?.json();
      const id = await linkedCustomerId(env,session);
      if (!id || session.expiresAt !== expiresAt) return null;
      const access = await verifyBookingIdentity(req, env);
      return access ? {id, role, privateAllowed:access.privateAllowed === true} : null;
    },
    dispatch(req, actor) {
      return privateBookingQa({store:env.QA_STORAGE, authorize:()=>actor})(req);
    },
  })(request);
}

export function adminPrivate(request, env, verifyAdminActor) {
  if (new URL(request.url).origin !== adminOrigin) return null;
  return privateSurfaces({
    async authorize(req, role) {
      if (role !== 'owner' || !privateEnabled(env) || !env.PRIVATE_BOOKING_QA) return null;
      const actor = await verifyAdminActor(req, env);
      return actor?.role === 'owner' && validId(actor.id) ? {id:actor.id,role} : null;
    },
    async dispatch(req, actor) {
      const url = new URL(req.url);
      const result = req.method === 'POST'
        ? await env.PRIVATE_BOOKING_QA.createJob(actor.id, await req.json())
        : await env.PRIVATE_BOOKING_QA.readRequests(actor.id, url.searchParams.get('client_id'));
      return Response.json(result.data, {status:result.status});
    },
  })(request);
}

export function modelPrivateEnabled(env, modelId) {
  return privateEnabled(env) && Boolean(env.PRIVATE_BOOKING_QA) && validId(modelId) &&
    validId(env.PRIVATE_QA_MODEL_BY_VERIFIED_ID?.[modelId]);
}

export function modelPrivate(request, env, verifyModelAuth) {
  if (new URL(request.url).origin !== modelOrigin) return null;
  return privateSurfaces({
    async authorize(req, role) {
      if (role !== 'model' || !privateEnabled(env)) return null;
      const session = await verifyModelAuth(req, env);
      const modelId = session?.modelId;
      return modelPrivateEnabled(env, modelId) ? {id:env.PRIVATE_QA_MODEL_BY_VERIFIED_ID[modelId], role} : null;
    },
    async dispatch(req, actor) {
      const ref = new URL(req.url).searchParams.get('booking_ref');
      const result = await env.PRIVATE_BOOKING_QA.readJobs(actor.id, ref);
      return Response.json(result.data, {status:result.status});
    },
  })(request);
}

async function privateBoundRequest(env, {actor, endpoint, query, body}) {
  if (!privateEnabled(env) || env.QA_ENABLED !== 'true' || !env.QA_STORAGE || !validId(actor.id)) {
    return {status:403,data:{error:'qa_binding_denied'}};
  }
  const url = new URL('/qa/private-booking/' + endpoint, bookingOrigin);
  if (query) url.search = new URLSearchParams(query).toString();
  const options = body ? {
    method:'POST',
    body:JSON.stringify(body),
    headers:{'Origin':bookingOrigin, 'Content-Type':'application/json'},
  } : {};
  const response = await privateBookingQa({store:env.QA_STORAGE, authorize:()=>actor})(new Request(url, options));
  return {status:response.status,data:await response.json()};
}

export function readPrivateRequests(env, id, clientId) {
  return privateBoundRequest(env, {
    actor:{id,role:'owner'}, endpoint:'requests', query:{client_id:clientId ?? ''},
  });
}

export function createPrivateJob(env, id, {client_id, booking_ref} = {}) {
  return privateBoundRequest(env, {
    actor:{id,role:'owner'}, endpoint:'create-job', body:{client_id,booking_ref},
  });
}

export function readPrivateModelJobs(env, id, bookingRef) {
  return privateBoundRequest(env, {
    actor:{id,role:'model'}, endpoint:'model-jobs', query:bookingRef === null ? {} : {booking_ref:bookingRef},
  });
}

export function confirmPrivateJob(env, id, input) {
  return privateBoundRequest(env, {actor:{id,role:'model'}, endpoint:'confirm-job', body:input});
}
