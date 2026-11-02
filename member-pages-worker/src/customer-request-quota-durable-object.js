const LIMIT = 4;
export class CustomerRequestQuotaCoordinator {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const body = await request.json().catch(() => null);
    if (!body?.month_key || !/^\d{4}-\d{2}$/.test(body.month_key) || !body?.request_id || !/^req_[A-Za-z0-9_-]{12,80}$/.test(body.request_id)) return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    if (!['reserve','commit','uncertain','release','reconcile'].includes(body.action)) return Response.json({ ok: false, error: 'invalid_action' }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const key = `month:${body.month_key}`; const state = normalize(await this.state.storage.get(key)); const existing = state.records[body.request_id];
      for (const id of Array.isArray(body.observed_request_ids) ? body.observed_request_ids : []) {
        if (/^req_[A-Za-z0-9_-]{12,80}$/.test(id) && !state.records[id]) state.records[id] = { fingerprint: '', status: 'committed', lease: '' };
      }
      const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 512) : '';
      if (existing && fingerprint && existing.fingerprint && existing.fingerprint !== fingerprint) return Response.json({ ok: false, error: 'REQUEST_ID_REUSE_CONFLICT' }, { status: 409 });
      if (body.action === 'reserve') {
        if (!fingerprint) return Response.json({ ok: false, error: 'fingerprint_required' }, { status: 400 });
        if (existing) {
          if (existing.status === 'pending') return Response.json({ ok: false, error: 'REQUEST_WRITE_IN_FLIGHT' }, { status: 409 });
          if (existing.status === 'uncertain') return Response.json({ ok: false, error: 'REQUEST_WRITE_UNCERTAIN' }, { status: 503 });
          return reply(existing, state);
        }
        const used = countUsed(state); if (used >= LIMIT) return Response.json({ ok: false, error: 'YOUR_REQUEST_MONTHLY_LIMIT', used, remaining: 0 }, { status: 429 });
        const lease = crypto.randomUUID(); state.records[body.request_id] = { fingerprint, status: 'pending', lease, updated_at: new Date().toISOString() }; await this.state.storage.put(key, state);
        return Response.json({ ok: true, idempotent: false, lease, status: 'pending', used: used + 1, remaining: Math.max(0, LIMIT - used - 1) });
      }
      if (!existing) return Response.json({ ok: false, error: 'reservation_not_found' }, { status: 404 });
      if (body.action !== 'reconcile' && body.lease !== existing.lease) return Response.json({ ok: false, error: 'reservation_lease_required' }, { status: 409 });
      if (body.action === 'commit') existing.status = 'committed';
      else if (body.action === 'uncertain') existing.status = 'uncertain';
      else if (body.action === 'release') { if (existing.status === 'uncertain' || existing.status === 'committed') return reply(existing, state); delete state.records[body.request_id]; }
      else if (body.action === 'reconcile') { if (!['committed','uncertain'].includes(body.status)) return Response.json({ ok: false, error: 'reconcile_status_required' }, { status: 400 }); existing.status = body.status; }
      await this.state.storage.put(key, state); return reply(existing || {}, state);
    });
  }
}
function normalize(value) { if (value && value.records && typeof value.records === 'object') return { records: value.records }; const records = {}; for (const id of Array.isArray(value) ? value : []) records[id] = { fingerprint: '', status: 'committed', lease: '' }; return { records }; }
function countUsed(state) { return Object.values(state.records).filter(r => ['pending','committed','uncertain'].includes(r.status)).length; }
function reply(record, state) { const used = countUsed(state); return Response.json({ ok: true, idempotent: true, status: record.status, lease: record.lease || undefined, used, remaining: Math.max(0, LIMIT - used) }); }
