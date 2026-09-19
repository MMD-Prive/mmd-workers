import runtime from "./runtime-index-with-application-v4.js";
import { maybeHandleMyMmsDispatch } from "./my-mms-dispatch-runtime.mjs";
import { maybeHandleMmsServiceZones } from "./service-zones-runtime.mjs";
import { canonicalZoneErrorResponse, maybeHandleCanonicalZoneBooking } from "./canonical-zone-booking-runtime.mjs";
import { canonicalZoneApplicationErrorResponse, maybeHandleCanonicalZoneApplication } from "./canonical-zone-application-runtime.mjs";
export { MmsCoordinator } from "./runtime-index-with-application-v4.js";
export { MmsDispatchCoordinator } from "./my-mms-dispatch-runtime.mjs";

const PREBOOKING_PATH = "/mms/api/prebookings";
const PREBOOKING_ID_RE = /^mmspre_[a-f0-9]{24}$/;

function jsonHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return headers;
}

async function autoDispatchPrebooking(request, response, env) {
  if (request.method !== "POST" || !response.ok) return response;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path !== PREBOOKING_PATH) return response;

  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  const prebookingId = String(payload?.prebooking?.prebooking_id || "").trim();
  if (!PREBOOKING_ID_RE.test(prebookingId)) return response;

  // Canonical Zone Code requests are handled before the legacy runtime and
  // already create their own exact-zone dispatch. Only legacy prebookings reach
  // this bridge.
  if (response.status === 202) {
    payload.dispatch = {
      state: "PENDING_COORDINATION",
      code: "PREBOOKING_STORAGE_PENDING",
    };
    return new Response(JSON.stringify(payload), { status: response.status, headers: jsonHeaders(response) });
  }

  const dispatchRequest = new Request(
    `https://${String(env.MMS_INTERNAL_HOST || "mms.internal")}/internal/mms/dispatch/prebookings/${encodeURIComponent(prebookingId)}/match`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_key: `auto:${prebookingId}` }),
    },
  );

  let dispatchResponse;
  try {
    dispatchResponse = await maybeHandleMyMmsDispatch(dispatchRequest, env);
  } catch {
    dispatchResponse = null;
  }

  if (!dispatchResponse) {
    payload.dispatch = { state: "PENDING_COORDINATION", code: "DISPATCH_UNAVAILABLE" };
    return new Response(JSON.stringify(payload), { status: response.status, headers: jsonHeaders(response) });
  }

  const dispatchPayload = await dispatchResponse.clone().json().catch(() => null);
  if (dispatchResponse.ok && dispatchPayload?.data) {
    const data = dispatchPayload.data;
    payload.dispatch = {
      state: String(data.state || "OFFERED"),
      job_id: String(data.job_id || data.job?.job_id || "") || null,
      offered_count: Number(data.offered_count ?? data.offers?.length ?? 0) || 0,
      expires_at: data.expires_at || null,
      duplicate: data.duplicate === true,
    };
  } else {
    payload.dispatch = {
      state: "PENDING_COORDINATION",
      code: String(dispatchPayload?.error?.code || `DISPATCH_${dispatchResponse.status}`).slice(0, 120),
    };
  }

  return new Response(JSON.stringify(payload), { status: response.status, headers: jsonHeaders(response) });
}

export default {
  async fetch(request, env, ctx) {
    const serviceZoneResponse = await maybeHandleMmsServiceZones(request, env);
    if (serviceZoneResponse) return serviceZoneResponse;

    try {
      const canonicalApplicationResponse = await maybeHandleCanonicalZoneApplication(request, env, ctx, runtime);
      if (canonicalApplicationResponse) return canonicalApplicationResponse;
    } catch (error) {
      console.error(JSON.stringify({
        event: "mms_canonical_zone_application_error",
        path: new URL(request.url).pathname,
        method: request.method,
        code: error?.code || error?.message || "APPLICATION_SERVICE_ZONE_UNAVAILABLE",
      }));
      return canonicalZoneApplicationErrorResponse(error);
    }

    try {
      const canonicalZoneResponse = await maybeHandleCanonicalZoneBooking(request, env);
      if (canonicalZoneResponse) return canonicalZoneResponse;
    } catch (error) {
      console.error(JSON.stringify({
        event: "mms_canonical_zone_booking_error",
        path: new URL(request.url).pathname,
        method: request.method,
        code: error?.code || error?.message || "CANONICAL_ZONE_UNAVAILABLE",
      }));
      return canonicalZoneErrorResponse(error);
    }

    const response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "POST" && path === PREBOOKING_PATH) {
      return autoDispatchPrebooking(request, response, env);
    }

    if (request.method === "GET" && (path === "/health" || path === "/ping") && response.ok) {
      try {
        const payload = await response.clone().json();
        payload.bindings = {
          ...(payload.bindings || {}),
          dispatch_coordinator: Boolean(env.MMS_DISPATCH_COORDINATOR),
          dispatch_jobs: Boolean(env.AIRTABLE_JOBS_TABLE_ID),
          dispatch_offers: Boolean(env.AIRTABLE_OFFERS_TABLE_ID),
          service_zones: Boolean(env.AIRTABLE_SERVICE_ZONES_TABLE_ID),
        };
        return new Response(JSON.stringify(payload), { status: response.status, headers: jsonHeaders(response) });
      } catch {
        return response;
      }
    }
    return response;
  },
};