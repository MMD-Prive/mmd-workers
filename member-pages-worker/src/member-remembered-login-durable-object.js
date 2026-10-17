import { DurableObject } from "cloudflare:workers";

const STORAGE_KEY = "remembered_login";
const MAX_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;

export class MemberRememberedLoginStore extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/credential") return new Response("Not found", { status: 404 });

    if (request.method === "PUT") {
      const input = await request.json().catch(() => null);
      const lineUserId = String(input?.line_user_id || "").trim();
      const issuedAt = Number(input?.issued_at);
      const expiresAt = Number(input?.expires_at);
      const now = Date.now();
      if (
        !/^U[A-Za-z0-9_-]{1,159}$/.test(lineUserId)
        || !Number.isFinite(issuedAt)
        || !Number.isFinite(expiresAt)
        || issuedAt > now + 60_000
        || expiresAt <= now
        || expiresAt - issuedAt > MAX_REMEMBER_MS
      ) return json({ ok: false, error: "invalid_credential" }, 400);

      await this.ctx.storage.put(STORAGE_KEY, {
        line_user_id: lineUserId,
        issued_at: issuedAt,
        expires_at: expiresAt,
      });
      await this.ctx.storage.setAlarm(expiresAt);
      return json({ ok: true }, 201);
    }

    if (request.method === "GET") {
      const record = await this.ctx.storage.get(STORAGE_KEY);
      if (!record || Number(record.expires_at || 0) <= Date.now()) {
        if (record) await this.ctx.storage.deleteAll();
        return json({ ok: false }, 404);
      }
      return json({ ok: true, data: record });
    }

    if (request.method === "DELETE") {
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    }

    return new Response("Method not allowed", { status: 405, headers: { allow: "GET,PUT,DELETE" } });
  }

  async alarm() {
    const record = await this.ctx.storage.get(STORAGE_KEY);
    if (record && Number(record.expires_at || 0) <= Date.now()) await this.ctx.storage.deleteAll();
  }
}

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
