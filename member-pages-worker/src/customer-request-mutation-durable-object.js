export class CustomerRequestMutationCoordinator {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const body = await request.json().catch(() => null);
    if (!body?.action || (body.action !== 'inspect' && !body.operation_id)) return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const current = await this.state.storage.get('lease');
      if (body.action === 'inspect') return Response.json({ ok: true, lease: current || null });
      if (body.action === 'begin') {
        if (current && current.operation_id !== body.operation_id) return Response.json({ ok: false, error: current.status === 'uncertain' ? 'REQUEST_MUTATION_UNCERTAIN' : 'REQUEST_MUTATION_IN_FLIGHT' }, { status: 409 });
        // Never release an outstanding external write by wall-clock expiry.
        // A late Airtable response could otherwise land after a new writer.
        const lease = { operation_id: body.operation_id, status: 'pending', mutation_fingerprint: body.mutation_fingerprint || `operation:${body.operation_id}`, started_at: Date.now() }; await this.state.storage.put('lease', lease); return Response.json({ ok: true, lease: body.operation_id });
      }
      if (body.action === 'prepare') {
        if (!current || current.operation_id !== body.operation_id || current.status === 'uncertain' || !body.mutation_fingerprint) return Response.json({ ok: false, error: 'REQUEST_MUTATION_LEASE_LOST' }, { status: 409 });
        current.mutation_fingerprint = String(body.mutation_fingerprint); await this.state.storage.put('lease', current); return Response.json({ ok: true, prepared: true });
      }
      if (body.action === 'finish') {
        if (!current || current.operation_id !== body.operation_id) return Response.json({ ok: false, error: 'REQUEST_MUTATION_LEASE_LOST' }, { status: 409 });
        if (body.mutation_fingerprint && current.mutation_fingerprint !== body.mutation_fingerprint) return Response.json({ ok: false, error: 'REQUEST_MUTATION_FINGERPRINT_MISMATCH' }, { status: 409 });
        if (body.status === 'uncertain') { current.status = 'uncertain'; await this.state.storage.put('lease', current); return Response.json({ ok: true, completed: 'uncertain' }); }
        if (body.status === 'aborted') { await this.state.storage.delete('lease'); return Response.json({ ok: true, completed: 'aborted' }); }
        if (current.status === 'uncertain') return Response.json({ ok: false, error: 'REQUEST_MUTATION_RECONCILE_REQUIRED' }, { status: 409 });
        await this.state.storage.delete('lease'); return Response.json({ ok: true, completed: 'committed' });
      }
      if (body.action === 'reconcile' && (current?.status === 'uncertain' || current?.status === 'pending') && current.operation_id === body.operation_id && body.readback_verified === true && body.mutation_fingerprint && current.mutation_fingerprint === body.mutation_fingerprint) { await this.state.storage.delete('lease'); return Response.json({ ok: true, reconciled: true }); }
      return Response.json({ ok: false, error: 'invalid_action' }, { status: 400 });
    });
  }
}
