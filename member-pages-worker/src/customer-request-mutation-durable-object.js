export class CustomerRequestMutationCoordinator {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const body = await request.json().catch(() => null);
    if (!body?.action || !body.operation_id) return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const current = await this.state.storage.get('lease');
      if (body.action === 'begin') {
        if (current && current.expires_at > Date.now() && current.operation_id !== body.operation_id) return Response.json({ ok: false, error: 'REQUEST_MUTATION_IN_FLIGHT' }, { status: 409 });
        const lease = { operation_id: body.operation_id, expires_at: Date.now() + 30000 }; await this.state.storage.put('lease', lease); return Response.json({ ok: true, lease: body.operation_id });
      }
      if (body.action === 'finish') {
        if (!current || current.operation_id !== body.operation_id) return Response.json({ ok: false, error: 'REQUEST_MUTATION_LEASE_LOST' }, { status: 409 });
        await this.state.storage.delete('lease'); return Response.json({ ok: true, completed: body.status || 'committed' });
      }
      return Response.json({ ok: false, error: 'invalid_action' }, { status: 400 });
    });
  }
}
