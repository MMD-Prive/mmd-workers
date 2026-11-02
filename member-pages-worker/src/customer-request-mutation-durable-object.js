export class CustomerRequestMutationCoordinator {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const body = await request.json().catch(() => null);
    if (!body?.action || !body.operation_id) return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const current = await this.state.storage.get('lease');
      if (body.action === 'begin') {
        if (current && current.operation_id !== body.operation_id) return Response.json({ ok: false, error: current.status === 'uncertain' ? 'REQUEST_MUTATION_UNCERTAIN' : 'REQUEST_MUTATION_IN_FLIGHT' }, { status: 409 });
        const lease = { operation_id: body.operation_id, expires_at: Date.now() + 30000 }; await this.state.storage.put('lease', lease); return Response.json({ ok: true, lease: body.operation_id });
      }
      if (body.action === 'finish') {
        if (!current || current.operation_id !== body.operation_id) return Response.json({ ok: false, error: 'REQUEST_MUTATION_LEASE_LOST' }, { status: 409 });
        if (body.status === 'uncertain') { current.status = 'uncertain'; await this.state.storage.put('lease', current); return Response.json({ ok: true, completed: 'uncertain' }); }
        if (current.status === 'uncertain') return Response.json({ ok: false, error: 'REQUEST_MUTATION_RECONCILE_REQUIRED' }, { status: 409 });
        await this.state.storage.delete('lease'); return Response.json({ ok: true, completed: 'committed' });
      }
      if (body.action === 'reconcile' && current?.status === 'uncertain' && current.operation_id === body.operation_id && body.confirmed === true) { await this.state.storage.delete('lease'); return Response.json({ ok: true, reconciled: true }); }
      return Response.json({ ok: false, error: 'invalid_action' }, { status: 400 });
    });
  }
}
