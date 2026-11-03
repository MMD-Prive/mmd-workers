import { PROFILE_OPERATION_CONTEXT } from './therapist-profile-operation-context.mjs';
import { handleMmsTherapistProfileRequest, therapistProfileErrorResponse, profileCoordinatorOwner, resumeProfilePlan, readProfileDirectoryInternal, profileProtocolProblem, profileProtocolHeaders } from './therapist-profile-runtime.mjs';

const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
const operationId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MAX_REVISION = 999_999_999_999_999; // Matches the bounded wire protocol.
const plannedPhases = new Set(['prepared', 'airtable_inflight', 'airtable_unknown', 'airtable_saved', 'manifest_saved', 'rejected']);

function validPending(record, owner, revision) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !operationId.test(record.id || '') || !/^[a-f0-9]{64}$/.test(record.fingerprint || '') || record.revision !== revision) return false;
  if (record.phase === 'validating') return record.plan === undefined;
  // A later phase can never be recomputed from the request if its plan is lost.
  return plannedPhases.has(record.phase) && record.plan?.owner === owner
    && /^rec[A-Za-z0-9]{10,30}$/.test(record.plan?.recordId || '');
}

// Factory keeps the exact implementation testable with synthetic durable storage.
// The production export supplies cloudflare:workers DurableObject as Base.
export function createMmsTherapistProfileCoordinator(Base) {
  return class MmsTherapistProfileCoordinator extends Base {
    constructor(ctx, env) { super(ctx, env); this.storage = ctx.storage; this.env = env; this.tail = Promise.resolve(); }
    // Private binding RPC only. No HTTP route, initialization or recovery.
    inspect(owner) {
      const result = this.tail.then(async () => {
        if (typeof owner !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(owner)) throw Error('PROFILE_INSPECTION_INVALID');
        const values = await this.storage.get(['owner', 'revision', 'pending']);
        const storedOwner = values.get('owner'), revision = values.get('revision'), pending = values.get('pending');
        if (storedOwner !== undefined && storedOwner !== owner) return {status:'DENIED'};
        if (storedOwner === undefined && revision === undefined && pending === undefined) return {status:'NOT_OBSERVED',drain:'UNKNOWN'};
        const head = revision === undefined ? 0 : revision;
        if (storedOwner !== owner || !Number.isSafeInteger(head) || head < 0 || head > MAX_REVISION
          || (pending != null && !validPending(pending, owner, head))) return {status:'CORRUPT',drain:'UNKNOWN'};
        return {status:pending ? 'PENDING' : 'NO_LOCAL_PENDING',revision:head,
          phase:pending?.phase || null,plan_present:pending?.plan !== undefined,
          writes_paused:this.env.MMS_PROFILE_WRITES_PAUSED === 'true',drain:'UNKNOWN'};
      });
      this.tail = result.catch(() => undefined);
      return result;
    }
    fetch(request) {
      // This queue covers external awaits in one instance. The persisted pending
      // record provides the separate crash/eviction barrier; no timer releases it.
      const result = this.tail.then(() => this.run(request));
      this.tail = result.catch(() => undefined);
      return result.catch(error => therapistProfileErrorResponse(error, request, this.env));
    }
    async run(request) {
      const problem = (status,code) => profileProtocolProblem(status,code,request,this.env);
      const url = new URL(request.url), internal = url.pathname.match(/^\/directory\/([A-Za-z0-9_-]{4,80})$/);
      if (internal && request.method !== 'GET') return problem(405, 'METHOD_NOT_ALLOWED');
      const owner = internal ? internal[1] : await profileCoordinatorOwner(request, this.env);
      const storedOwner = await this.storage.get('owner');
      if (storedOwner !== undefined && storedOwner !== owner) return problem(403, 'PROFILE_ACCOUNT_MISMATCH');
      const storedRevision = await this.storage.get('revision');
      const revision = storedRevision === undefined ? 0 : storedRevision;
      const pending = await this.storage.get('pending');
      if (!Number.isSafeInteger(revision) || revision < 0 || revision > MAX_REVISION
        || (pending !== undefined && pending !== null && !validPending(pending, owner, revision))
        || (storedOwner === undefined && (storedRevision !== undefined || pending != null))) return problem(503, 'PROFILE_JOURNAL_INVALID');
      if (storedOwner === undefined) await this.storage.put('owner', owner);
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        if (pending) return problem(503, 'PROFILE_OPERATION_PENDING');
        if (internal) return Response.json(await readProfileDirectoryInternal(owner, this.env), { headers: { 'Cache-Control': 'no-store' } });
        return handleMmsTherapistProfileRequest(request, { ...this.env, [PROFILE_OPERATION_CONTEXT]: { revision } });
      }
      const id = request.headers.get('X-Profile-Operation-Id');
      if (!operationId.test(id || '')) return problem(428, 'PROFILE_OPERATION_ID_REQUIRED');
      const expectedText = request.headers.get('X-Profile-Revision');
      if (!/^(0|[1-9][0-9]{0,14})$/.test(expectedText || '')) return problem(428, 'PROFILE_REVISION_REQUIRED');
      const declared = Number(request.headers.get('Content-Length') || 0);
      if (declared > 10 * 1024 * 1024) return problem(413, 'PHOTO_TOO_LARGE');
      const chunks = []; let size = 0;
      if (request.body) {
        const reader = request.body.getReader();
        try {
          for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
            if (size > 10 * 1024 * 1024) { await reader.cancel(); return problem(413, 'PHOTO_TOO_LARGE'); } chunks.push(value); }
        } catch { return problem(400, 'PROFILE_READ_FAILED'); }
      }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const fingerprint = await hash(new TextEncoder().encode(JSON.stringify([request.method, url.pathname, request.headers.get('Content-Type'), request.headers.get('X-Upload-Id'), request.headers.get('X-File-Name'), await hash(bytes)])));
      if (pending && (pending.id !== id || pending.fingerprint !== fingerprint)) return problem(409, pending.id === id ? 'PROFILE_OPERATION_ID_REUSED' : 'PROFILE_OPERATION_PENDING');
      const saved = await this.storage.get('op:' + id);
      if (saved) {
        if (saved.fingerprint !== fingerprint) return problem(409, 'PROFILE_OPERATION_ID_REUSED');
        if (saved.revision !== revision) return problem(409, 'PROFILE_OPERATION_SUPERSEDED');
        // A pre-intent transient failure has no external effects to replay.
        // Keep its fingerprint/revision, but allow the exact request to prepare
        // again. Never apply this rule after a durable plan was recorded.
        if (!saved.retryableBeforeEffects) return this.receipt(saved.result,request);
      }
      if (!pending && Number(expectedText) !== revision) return problem(409, 'PROFILE_REVISION_CONFLICT');
      if (revision === MAX_REVISION) return problem(503, 'PROFILE_REVISION_EXHAUSTED');
      const record = pending || { id, fingerprint, phase: 'validating', revision };
      if (!pending) await this.storage.put('pending', record);
      const context = {
        id, revision, record,
        deleted: photo => this.storage.get('deleted:' + photo),
        start: async plan => {
          record.plan = plan; record.phase = 'prepared';
          const updates = { pending: record };
          if (plan.deletedPhoto) updates['deleted:' + plan.deletedPhoto] = true;
          await this.storage.put(updates);
        },
        phase: async phase => { record.phase = phase; await this.storage.put('pending', record); },
        reject: async () => { record.phase = 'rejected'; await this.storage.put('pending', record); },
      };
      const ownedEnv = { ...this.env, [PROFILE_OPERATION_CONTEXT]: context };
      const wire = new Request(request.url, { method: request.method, headers: request.headers, ...(bytes.length ? { body: bytes } : {}) });
      let response;
      try {
        response = record.plan ? await resumeProfilePlan(wire, ownedEnv) : await handleMmsTherapistProfileRequest(wire, ownedEnv);
      } catch (error) { response = therapistProfileErrorResponse(error, wire, ownedEnv); }
      const result = { status: response.status, headers: [...response.headers], body: await response.text() };
      if (response.ok) {
        // Multi-key storage.put is atomic. Persist the result and revision before
        // acknowledging success. A lost durable-store acknowledgement is retried
        // from this journal; external effects are not started again blindly.
        await this.storage.put({ pending: null, revision: revision + 1, ['op:' + id]: { fingerprint, revision: revision + 1, result } });
      } else if (!record.plan || record.phase === 'rejected') {
        await this.storage.put({ pending: null, ['op:' + id]: { fingerprint, revision, result, retryableBeforeEffects: !record.plan && response.status >= 500 } });
      }
      return this.receipt(result,request);
    }
    receipt(result,request) {
      // A receipt may be retried from another allowed origin. Do not replay an
      // earlier request's CORS grant or expose it to an untrusted origin.
      const headers=new Headers(result.headers);
      for(const key of [...headers.keys()])if(key.startsWith('access-control-')||key==='vary')headers.delete(key);
      for(const [key,value] of Object.entries(profileProtocolHeaders(request,this.env)))headers.set(key,value);
      return new Response(result.status===204?null:result.body,{status:result.status,headers});
    }
  };
}
