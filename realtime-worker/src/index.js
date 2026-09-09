// realtime-worker — LOCK v2026-LOCK-RT-02
// Purpose: WebSocket rooms (chat/location), room-token issuing via internal endpoint.
// Location is fail-closed: only the model token may publish, and only after an
// authenticated internal service explicitly enables a short-lived room policy.
// Video call: intended via provider tokens (Daily/Twilio) — not implemented in this minimal deploy.

const LOCATION_POLICY_PATH = "/v1/rt/room/location-policy";
const LOCATION_DEFAULT_TTL_SECONDS = 3600;
const LOCATION_POINT_TTL_SECONDS = 180;
const LOCATION_MAX_POLICY_TTL_SECONDS = 8 * 60 * 60;

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Set();
  }

  async fetch(req) {
    const url = new URL(req.url);

    // Internal: store room tokens.
    if (url.hostname === "do.local" && url.pathname === "/store_tokens" && req.method === "POST") {
      const data = await req.json().catch(() => null);
      if (!data?.customer || !data?.model) return new Response("bad_request", { status: 400 });
      await this.state.storage.put("room_tokens", { customer: String(data.customer), model: String(data.model) });
      return new Response("ok", { status: 200 });
    }

    // Internal: enable/disable short-lived location permission for this room.
    if (url.hostname === "do.local" && url.pathname === "/set_location_policy" && req.method === "POST") {
      const data = await req.json().catch(() => null);
      if (!data || typeof data.enabled !== "boolean") return doJson({ ok: false, error: "bad_request" }, 400);
      const next = normalizeRoomLocationPolicy(data);
      await this.state.storage.put("location_policy", next);
      if (!next.enabled) await this.state.storage.delete("last_location");
      await this._scheduleLocationAlarm(next.expires_at_ms || Date.now() + 1000);
      return doJson({ ok: true, data: safeRoomLocationPolicy(next) }, 200);
    }

    if (url.hostname === "do.local" && url.pathname === "/clear_location" && req.method === "POST") {
      await this.state.storage.delete("last_location");
      return doJson({ ok: true }, 200);
    }

    // WebSocket upgrade.
    if (url.pathname === "/v1/rt/ws") {
      const token = (url.searchParams.get("token") || "").trim();
      const room = (url.searchParams.get("room") || "").trim();

      if (!room) return new Response("bad_request", { status: 400 });

      const role = await this._roomRole(token);
      if (!role) return new Response("unauthorized", { status: 401 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.sockets.add(server);

      server.addEventListener("message", (evt) => this._onMessage(server, evt.data, room, role));
      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("error", () => this.sockets.delete(server));

      const lastLoc = await this._readVisibleLocation();
      server.send(JSON.stringify({ type: "hello", room, role, ts: Date.now(), last_location: lastLoc }));

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not_found", { status: 404 });
  }

  async alarm() {
    const now = Date.now();
    const policy = await this.state.storage.get("location_policy");
    const last = await this.state.storage.get("last_location");

    if (!policy || !policy.enabled || !Number.isFinite(Number(policy.expires_at_ms)) || Number(policy.expires_at_ms) <= now) {
      await this.state.storage.delete("last_location");
      if (policy && Number(policy.expires_at_ms) <= now) {
        await this.state.storage.put("location_policy", { ...policy, enabled: false });
      }
    } else if (last && (!Number.isFinite(Number(last.expires_at_ms)) || Number(last.expires_at_ms) <= now)) {
      await this.state.storage.delete("last_location");
    }

    const refreshedPolicy = await this.state.storage.get("location_policy");
    const refreshedLast = await this.state.storage.get("last_location");
    const candidates = [refreshedPolicy?.expires_at_ms, refreshedLast?.expires_at_ms]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > now);
    if (candidates.length) await this.state.storage.setAlarm(Math.min(...candidates));
  }

  async _roomRole(token) {
    if (!token) return "";
    const data = await this.state.storage.get("room_tokens");
    if (!data) return "";
    if (token === data.model) return "model";
    if (token === data.customer) return "customer";
    return "";
  }

  async _onMessage(ws, raw, room, role) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const type = String(msg?.type || "");
    if (!["ping", "chat", "location", "photo_meta"].includes(type)) return;

    if (type === "ping") {
      ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      return;
    }

    if (type === "location") {
      if (role !== "model") {
        ws.send(JSON.stringify({ type: "location_error", error: "model_token_required", ts: Date.now() }));
        return;
      }

      const policy = await this._activeLocationPolicy();
      if (!policy) {
        await this.state.storage.delete("last_location");
        ws.send(JSON.stringify({ type: "location_error", error: "location_policy_disabled", ts: Date.now() }));
        return;
      }

      const point = normalizeRealtimeLocationPoint(msg, Date.now());
      if (!point.ok) {
        ws.send(JSON.stringify({ type: "location_error", error: point.error, ts: Date.now() }));
        return;
      }

      const expiresAtMs = Math.min(
        policy.expires_at_ms,
        Date.now() + LOCATION_POINT_TTL_SECONDS * 1000,
      );
      const stored = {
        lat: point.lat,
        lng: point.lng,
        accuracy_m: point.accuracy_m,
        captured_at: point.captured_at,
        ts: Date.now(),
        expires_at_ms: expiresAtMs,
      };
      await this.state.storage.put("last_location", stored);
      await this._scheduleLocationAlarm(expiresAtMs);

      const out = {
        type: "location",
        room,
        lat: stored.lat,
        lng: stored.lng,
        accuracy_m: stored.accuracy_m,
        captured_at: stored.captured_at,
        server_ts: stored.ts,
      };
      this._broadcast(out);
      return;
    }

    this._broadcast({ ...msg, room, server_ts: Date.now() });
  }

  async _activeLocationPolicy() {
    const policy = await this.state.storage.get("location_policy");
    if (!policy || policy.enabled !== true) return null;
    const expiresAtMs = Number(policy.expires_at_ms);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return null;
    return { ...policy, expires_at_ms: expiresAtMs };
  }

  async _readVisibleLocation() {
    const policy = await this._activeLocationPolicy();
    if (!policy) {
      await this.state.storage.delete("last_location");
      return null;
    }
    const last = await this.state.storage.get("last_location");
    if (!last) return null;
    const expiresAtMs = Number(last.expires_at_ms);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      await this.state.storage.delete("last_location");
      return null;
    }
    return {
      lat: last.lat,
      lng: last.lng,
      accuracy_m: last.accuracy_m ?? null,
      captured_at: last.captured_at || null,
      ts: last.ts,
    };
  }

  async _scheduleLocationAlarm(atMs) {
    const next = Number(atMs);
    if (Number.isFinite(next) && next > Date.now()) await this.state.storage.setAlarm(next);
  }

  _broadcast(payload) {
    const text = JSON.stringify(payload);
    for (const socket of this.sockets) {
      try { socket.send(text); } catch {}
    }
  }
}

export function normalizeRealtimeLocationPoint(input, nowMs = Date.now()) {
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: "latitude_invalid" };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, error: "longitude_invalid" };

  let accuracyM = null;
  if (input?.accuracy_m !== undefined && input?.accuracy_m !== null && input?.accuracy_m !== "") {
    accuracyM = Number(input.accuracy_m);
    if (!Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > 5000) return { ok: false, error: "accuracy_invalid" };
    accuracyM = Math.round(accuracyM * 10) / 10;
  }

  let capturedAtMs = nowMs;
  if (input?.captured_at) {
    capturedAtMs = Date.parse(String(input.captured_at));
    if (!Number.isFinite(capturedAtMs) || capturedAtMs < nowMs - 5 * 60 * 1000 || capturedAtMs > nowMs + 60 * 1000) {
      return { ok: false, error: "captured_at_invalid" };
    }
  }

  return {
    ok: true,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    accuracy_m: accuracyM,
    captured_at: new Date(capturedAtMs).toISOString(),
  };
}

export function normalizeRoomLocationPolicy(input, nowMs = Date.now()) {
  const enabled = input?.enabled === true;
  if (!enabled) {
    return {
      enabled: false,
      job_id: String(input?.job_id || "").trim(),
      expires_at_ms: nowMs,
      updated_at: new Date(nowMs).toISOString(),
    };
  }
  const requested = Number.parseInt(input?.ttl_seconds, 10);
  const ttlSeconds = Number.isFinite(requested)
    ? Math.max(60, Math.min(LOCATION_MAX_POLICY_TTL_SECONDS, requested))
    : LOCATION_DEFAULT_TTL_SECONDS;
  return {
    enabled: true,
    job_id: String(input?.job_id || "").trim(),
    expires_at_ms: nowMs + ttlSeconds * 1000,
    updated_at: new Date(nowMs).toISOString(),
  };
}

function safeRoomLocationPolicy(policy) {
  return {
    enabled: policy?.enabled === true,
    job_id: String(policy?.job_id || ""),
    expires_at: Number.isFinite(Number(policy?.expires_at_ms)) ? new Date(Number(policy.expires_at_ms)).toISOString() : null,
    model_publish_only: true,
    latest_point_only: true,
    point_retention_seconds: LOCATION_POINT_TTL_SECONDS,
  };
}

function corsHeaders(origin, allowedCsv) {
  const allowed = (allowedCsv || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = origin && allowed.includes(origin);
  const h = new Headers();
  if (ok) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type, X-Internal-Token");
    h.set("Access-Control-Allow-Credentials", "true");
  }
  return h;
}

function requireInternal(req, env) {
  const supplied = (req.headers.get("X-Internal-Token") || "").trim();
  if (!supplied) return false;
  const expected = [env.AUTH_SERVICE_EVENTS_TO_REALTIME, env.AUTH_SERVICE_ADMIN_TO_REALTIME]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return expected.some((value) => value === supplied);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const origin = req.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response(JSON.stringify({ ok: true, worker: "realtime-worker" }), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...Object.fromEntries(cors) }),
      });
    }

    // Internal: open room and issue tokens.
    if (method === "POST" && url.pathname === "/v1/rt/room/open") {
      if (!requireInternal(req, env)) return new Response("unauthorized", { status: 401, headers: cors });

      const body = await req.json().catch(() => null);
      if (!body?.job_id) return new Response("bad_request", { status: 400, headers: cors });

      const jobId = String(body.job_id);
      const roomName = `room:${jobId}`;
      const customer = crypto.randomUUID();
      const model = crypto.randomUUID();
      const id = env.ROOM.idFromName(roomName);
      const stub = env.ROOM.get(id);

      await stub.fetch("https://do.local/store_tokens", {
        method: "POST",
        body: JSON.stringify({ customer, model }),
      });
      // Location starts disabled for every room. It requires an explicit later policy enable.
      await stub.fetch("https://do.local/set_location_policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false, job_id: jobId }),
      });

      const webBase = String(env.WEB_BASE_URL || "").replace(/\/+$/, "");
      const liveCustomerUrl = `${webBase}/live?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(customer)}`;
      const liveModelUrl = `${webBase}/live?room=${encodeURIComponent(roomName)}&token=${encodeURIComponent(model)}`;

      return new Response(JSON.stringify({
        ok: true,
        job_id: jobId,
        room: roomName,
        live_customer_url: liveCustomerUrl,
        live_model_url: liveModelUrl,
        location_enabled: false,
      }), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...Object.fromEntries(cors) }),
      });
    }

    // Internal: only an authenticated service may open the room's location gate.
    if (method === "POST" && url.pathname === LOCATION_POLICY_PATH) {
      if (!requireInternal(req, env)) return doJson({ ok: false, error: "unauthorized" }, 401, cors);
      const body = await req.json().catch(() => null);
      if (!body?.job_id || typeof body.enabled !== "boolean") return doJson({ ok: false, error: "bad_request" }, 400, cors);
      const jobId = String(body.job_id);
      const roomName = `room:${jobId}`;
      const id = env.ROOM.idFromName(roomName);
      const stub = env.ROOM.get(id);
      const upstream = await stub.fetch("https://do.local/set_location_policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: body.enabled, job_id: jobId, ttl_seconds: body.ttl_seconds }),
      });
      const payload = await upstream.json().catch(() => ({ ok: false, error: "policy_update_failed" }));
      return doJson(payload, upstream.status, cors);
    }

    // Public: WebSocket endpoint routed to DO.
    if (method === "GET" && url.pathname === "/v1/rt/ws") {
      const room = (url.searchParams.get("room") || "").trim();
      if (!room) return new Response("bad_request", { status: 400, headers: cors });
      const id = env.ROOM.idFromName(room);
      return env.ROOM.get(id).fetch(req);
    }

    return new Response("not_found", { status: 404, headers: cors });
  },
};

function doJson(payload, status = 200, extraHeaders = undefined) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (extraHeaders) {
    for (const [key, value] of extraHeaders.entries ? extraHeaders.entries() : Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }
  return new Response(JSON.stringify(payload), { status, headers });
}
