import worker from "./index.js";
import { adminRuntimeErrorResponse, handleMmsAdminRuntime, isMmsAdminRuntimeRequest } from "./admin-runtime.mjs";
import { handleMmsMemberReadRequest, isMmsMemberReadRequest } from "./member-read-runtime.mjs";
import {
  handleMmsTherapistAuthRequest,
  isMmsTherapistAuthRequest,
  therapistAuthErrorResponse,
} from "./therapist-auth-runtime.mjs";
import {
  handleMmsTherapistProfileRequest,
  isMmsTherapistProfileRequest,
  therapistProfileErrorResponse,
} from "./therapist-profile-runtime.mjs";
import {
  handleMmsTherapistGpsVisibilityRequest,
  isMmsTherapistGpsVisibilityRequest,
  therapistGpsVisibilityErrorResponse,
} from "./therapist-gps-visibility-runtime.mjs";

export { MmsCoordinator } from "./index.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isMmsTherapistGpsVisibilityRequest(url.pathname)) {
      try {
        return await handleMmsTherapistGpsVisibilityRequest(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "mms_therapist_gps_visibility_error",
          path: url.pathname,
          method: request.method,
          code: error?.code || "THERAPIST_GPS_VISIBILITY_UNAVAILABLE",
        }));
        if (error?.code === "ORIGIN_NOT_ALLOWED") {
          return Response.json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } }, { status: 403, headers: { "Cache-Control": "no-store" } });
        }
        return therapistGpsVisibilityErrorResponse(error, request, env);
      }
    }
    if (isMmsTherapistProfileRequest(url.pathname)) {
      try {
        return await handleMmsTherapistProfileRequest(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "mms_therapist_profile_error",
          path: url.pathname,
          method: request.method,
          code: error?.code || "THERAPIST_PROFILE_UNAVAILABLE",
        }));
        return therapistProfileErrorResponse(error, request, env);
      }
    }
    if (isMmsTherapistAuthRequest(url.pathname)) {
      try {
        return await handleMmsTherapistAuthRequest(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "mms_therapist_auth_error",
          path: url.pathname,
          method: request.method,
          code: error?.code || "THERAPIST_AUTH_UNAVAILABLE",
        }));
        return therapistAuthErrorResponse(error, request, env);
      }
    }
    if (isMmsMemberReadRequest(url.pathname)) {
      return handleMmsMemberReadRequest(request, env);
    }
    if (isMmsAdminRuntimeRequest(url.pathname)) {
      try {
        return await handleMmsAdminRuntime(request, env, ctx);
      } catch (error) {
        console.error(JSON.stringify({
          event: "mms_admin_runtime_error",
          path: url.pathname,
          method: request.method,
          code: error?.code || "INTERNAL_ERROR",
        }));
        return adminRuntimeErrorResponse(error);
      }
    }
    return worker.fetch(request, env, ctx);
  },
};
