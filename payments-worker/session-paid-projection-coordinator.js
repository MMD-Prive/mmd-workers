import { DurableObject } from 'cloudflare:workers';
import { SessionPaidProjectionState } from './session-paid-projection.js';

// Runtime adapter only; the state machine is also tested with fixture storage.
export class SessionPaidProjectionCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.projection = new SessionPaidProjectionState(ctx, env);
  }
  fetch(request) { return this.projection.fetch(request); }
  alarm() { return this.projection.alarm(); }
}
