export class CustomerRequestQuotaCoordinator {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const body = await request.json().catch(() => null);
    if (!body?.month_key || !body?.request_id || !["reserve", "release"].includes(body.action)) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const key = `month:${body.month_key}`;
      const slots = new Set((await this.state.storage.get(key)) || []);
      if (body.action === "release") { slots.delete(body.request_id); await this.state.storage.put(key, [...slots]); return Response.json({ ok: true, released: true }); }
      if (slots.has(body.request_id)) return Response.json({ ok: true, idempotent: true, used: slots.size, remaining: Math.max(0, 4 - slots.size) });
      if (slots.size >= 4) return Response.json({ ok: false, error: "YOUR_REQUEST_MONTHLY_LIMIT", used: slots.size, remaining: 0 }, { status: 429 });
      slots.add(body.request_id); await this.state.storage.put(key, [...slots]);
      return Response.json({ ok: true, idempotent: false, used: slots.size, remaining: Math.max(0, 4 - slots.size) });
    });
  }
}
