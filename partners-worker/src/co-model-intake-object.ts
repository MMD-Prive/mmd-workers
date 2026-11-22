import { DurableObject } from 'cloudflare:workers';
import { createIntake, renderIntake } from './co-model-intake.mjs';
import { transactionalIntakeStore } from './co-model-intake-store.mjs';

export class CoModelIntakeObject extends DurableObject {
  async receive(partnerId: string, request: Request, id: string, linkId: string) {
    const intake = createIntake({
      store: transactionalIntakeStore(this.ctx.storage),
      authenticatePartner: async () => ({ id: partnerId }),
    });
    const result = await intake.receive(request, id, linkId);
    if (request.method === 'GET' || result.status !== 200) return renderIntake(result, request);
    return new Response(null, { status: 303, headers: {
      Location: new URL(request.url).pathname + new URL(request.url).search,
      'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    } });
  }

  // Internal binding only. Caller must authenticate the Owner and resolve the
  // selected recipient to an existing canonical Partner record before calling.
  async manage(owner: { role: string }, id: string, operation: string,
    draft?: { partnerId: string; mode: string; description: string }) {
    return createIntake({ store: transactionalIntakeStore(this.ctx.storage),
      authenticatePartner: async () => null }).manage(owner, id, operation, draft);
  }
}
