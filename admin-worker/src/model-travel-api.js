import { assertTravelModel, cancelTravelSubmission, commitTravelSubmission, prepareTravelSubmission, projectTravel, readBoundedTravelBody, readTravelSession, travelError, travelJson, travelPhotoResponse, uploadTravelPhoto } from '../../shared/model-travel-store.mjs';
import { notifyTravelEvent, travelDeliveryStatus } from './model-travel-notification.js';

export const MODEL_TRAVEL_PATH = '/v1/model/session/travel';
export function isModelTravelPath(path) { return path === MODEL_TRAVEL_PATH || path === MODEL_TRAVEL_PATH + '/photo'; }

export async function handleModelTravelApi(request, env, authenticate, originAllowed) {
  try {
    const auth = await authenticate(request, env);
    if (!auth.ok) return travelJson({ ok: false, error: auth.error }, auth.status);
    const url = new URL(request.url), method = request.method;
    if (!['GET', 'PUT', 'POST'].includes(method)) throw travelError('method_not_allowed', 405);
    if (method !== 'GET' && (request.headers.get('origin') !== url.origin || !originAllowed(request, env))) throw travelError('origin_not_allowed', 403);
    let body = null;
    if (method === 'POST') {
      try { body = JSON.parse(new TextDecoder().decode(await readBoundedTravelBody(request, 8192))); }
      catch (error) { throw error.code ? error : travelError('invalid_json', 400); }
    }
    const sessionId = body?.session_id || url.searchParams.get('session_id');
    if (url.searchParams.getAll('session_id').length > 1 || ['model_id','model_record_id','client_id','line_user_id'].some(key=>url.searchParams.has(key))) throw travelError('travel_selector_invalid',400);
    const record = await readTravelSession(env, sessionId), modelId = auth.payload.model_record_id;
    assertTravelModel(record, modelId);
    if (url.pathname.endsWith('/photo')) {
      if (method !== 'GET') throw travelError('method_not_allowed', 405);
      return await travelPhotoResponse(env, record, url.searchParams.get('media_id'));
    }
    if (method === 'GET') {
      const data = await projectTravel(env, record, 'model');
      for (const entry of data.submissions) if (entry.state === 'saved') entry.delivery = await travelDeliveryStatus(env, record, entry.id);
      return travelJson(data);
    }
    if (method === 'PUT') {
      if(url.searchParams.getAll('index').length!==1 || !/^[0-2]$/.test(url.searchParams.get('index')||'')) throw travelError('travel_photo_invalid',400);
      return travelJson(await uploadTravelPhoto(env, record, modelId, url.searchParams.get('id'), Number(url.searchParams.get('index')), request));
    }
    if (body?.action === 'prepare') return travelJson(await prepareTravelSubmission(env, record, modelId, body));
    if (body?.action === 'cancel') return travelJson(await cancelTravelSubmission(env, record, modelId, body.id));
    if (body?.action === 'commit') {
      const result = await commitTravelSubmission(env, record, modelId, body.id);
      return travelJson({ ...result, delivery: await notifyTravelEvent(env, record, body.id) });
    }
    throw travelError('travel_action_invalid', 400);
  } catch (error) { return travelJson({ ok: false, error: error.code || 'travel_unavailable' }, error.status || 503); }
}
