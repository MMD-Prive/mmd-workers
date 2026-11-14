import { scope } from './context.mjs';
import { setup } from '../.build/admin-worker/test/fixtures/create-job-form-runtime.mjs';
import admin from '../.build/admin-worker/src/admin-login-hero-worker.js';
import { readModelSources } from '../.build/admin-worker/src/create-job-drive-discovery.js';

export class CreateJobFixtureRun {
  constructor(state) {
    this.state = state;
    this.queue = Promise.resolve();
  }
  fetch(request) {
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.catch(() => {});
    return result;
  }
  async handle(request) {
    const snapshot = await this.state.storage.get('fixture');
    const fixture = setup({ privateJob: true });
    for (const [table, rows] of snapshot?.records || []) fixture.records.set(table, rows);
    for (const [key, value] of snapshot?.kv || []) fixture.kv.set(key, value);
    fixture.issuances.push(...(snapshot?.issuances || []));
    let mode = snapshot?.mode || 'valid';
    const url = new URL(request.url);
    const intercept = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : input);
      if (target.hostname !== 'api.airtable.com' && target.hostname !== 'notify.example.test') {
        throw new Error('fixture_egress_denied');
      }
      if (target.pathname.includes('tblrmSsCZxJSCQR9n')) {
        if (mode === 'unavailable') return Response.json({}, { status: 503 });
        return Response.json({ records: [{ id: 'recREFERRAL000001', fields: {
          Model: ['recMODEL000000001'], Partner: ['recPARTNER0000001'],
          'Ownership Status': mode === 'changed' ? 'revoked' : 'verified',
        } }] });
      }
      if (target.pathname.includes('tbl1ksDlsTiiGEHWe')) {
        return Response.json({ id: 'recPARTNER0000001', fields: {
          fldXb55aiAjNPOUWc: 'fixture-partner', fldpJWfASq7PfkMgC: 'Fixture Partner',
          fldajmg66pf2ifGPu: 'active', fldwRzdtIoPbHKr7n: 'recognized',
        } });
      }
      return fixture.fetch(input, init);
    };
    const response = await scope.run({ fetch: intercept }, async () => {
      if (url.pathname === '/qa/create-job/mode' && request.method === 'POST') {
        const body = await request.json();
        if (!['valid', 'changed', 'unavailable'].includes(body.mode)) return Response.json({ error: 'invalid_mode' }, { status: 400 });
        mode = body.mode;
        return Response.json({ fixture: true, mode });
      }
      if (url.pathname === '/qa/create-job/evidence' && request.method === 'GET') {
        return Response.json({ fixture: true, mode, intents: (fixture.records.get('tblWGGJJOx5eBvBZJ') || []).map(row => ({ amount_thb: row.fields.fldvCSwrUW8OMAooS })), issuances: fixture.issuances.length });
      }
      if (url.pathname === '/v1/admin/models/sources') {
        return Response.json({ fixture: true, ok: true, ...await readModelSources(fixture.env, 'recMODEL000000001') });
      }
      // Outer staging gateway has already authenticated the real Owner.
      const { createCredentialBoundAdminSession } = await import('../.build/admin-worker/src/credential-bound-admin-session.js');
      const token = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture-owner', role: 'owner' }, fixture.env);
      const headers = new Headers(request.headers);
      headers.set('Cookie', 'mmd_admin_gate_v1=' + token);
      headers.set('Origin', 'https://mmdbkk.com');
      const forwarded = new Request('https://mmdbkk.com' + url.pathname + url.search, {
        method: request.method, headers,
        ...(request.method === 'GET' ? {} : { body: await request.text() }),
      });
      return admin.fetch(forwarded, fixture.env, {});
    });
    await this.state.storage.put('fixture', {
      mode, records: [...fixture.records], kv: [...fixture.kv], issuances: fixture.issuances,
    });
    return response;
  }
}
