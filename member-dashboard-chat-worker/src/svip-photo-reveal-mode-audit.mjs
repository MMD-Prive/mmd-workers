import { normalizeSvipPhotoRevealMode } from "../../shared/svip-photo-reveal-rollout.mjs";

const HISTORY_LIMIT = 32;

function clean(value, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

export class SvipPhotoRevealModeAudit {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/status" && request.method === "GET") {
      const [mode, version, last, history] = await Promise.all([
        this.state.storage.get("mode"),
        this.state.storage.get("version"),
        this.state.storage.get("last"),
        this.state.storage.get("history"),
      ]);
      return Response.json({
        ok: true,
        mode: mode || "off",
        version: Number(version || 0),
        last: last || null,
        history: Array.isArray(history) ? history : [],
      }, { headers: { "cache-control": "no-store" } });
    }

    if (url.pathname !== "/observe" || request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    const body = await request.json().catch(() => ({}));
    const mode = normalizeSvipPhotoRevealMode(body.mode);
    const source = clean(body.source || "runtime", 120);
    const observedAt = new Date().toISOString();

    return this.state.storage.transaction(async txn => {
      const previous = normalizeSvipPhotoRevealMode(await txn.get("mode"));
      const initialized = await txn.get("initialized") === true;
      if (initialized && previous === mode) {
        return Response.json({ ok: true, changed: false, mode, version: Number(await txn.get("version") || 0) }, { headers: { "cache-control": "no-store" } });
      }

      const version = Number(await txn.get("version") || 0) + 1;
      const event = {
        version,
        from: initialized ? previous : "unset",
        to: mode,
        source,
        changed_at: observedAt,
      };
      const history = Array.isArray(await txn.get("history")) ? await txn.get("history") : [];
      history.push(event);
      while (history.length > HISTORY_LIMIT) history.shift();

      await txn.put("initialized", true);
      await txn.put("mode", mode);
      await txn.put("version", version);
      await txn.put("last", event);
      await txn.put("history", history);

      console.log("svip_photo_reveal_mode_transition", JSON.stringify(event));
      return Response.json({ ok: true, changed: true, ...event }, { headers: { "cache-control": "no-store" } });
    });
  }
}

export async function observeSvipPhotoRevealMode(env = {}, source = "runtime") {
  const binding = env.SVIP_PHOTO_REVEAL_MODE_AUDIT;
  if (!binding?.idFromName || !binding?.get) return { ok: false, reason: "mode_audit_unconfigured" };
  const stub = binding.get(binding.idFromName("global"));
  const response = await stub.fetch("https://svip-photo-mode.internal/observe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: normalizeSvipPhotoRevealMode(env.KENJI_SVIP_PHOTO_REVEAL_MODE),
      source: clean(source, 120),
    }),
  });
  return response.json().catch(() => ({ ok: false, reason: "mode_audit_unreadable" }));
}
