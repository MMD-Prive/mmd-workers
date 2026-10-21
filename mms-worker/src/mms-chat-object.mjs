import { DurableObject } from 'cloudflare:workers';
import { MmsChatStore } from './mms-chat-store.mjs';

export class MmsDirectChat extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.chat = new MmsChatStore(ctx.storage);
  }
  consent(...args) { return this.chat.consent(...args); }
  initialize(...args) { return this.chat.initialize(...args); }
  join(...args) { return this.chat.join(...args); }
  threads(...args) { return this.chat.threads(...args); }
  read(...args) { return this.chat.read(...args); }
  send(...args) { return this.chat.send(...args); }
  requestReview(...args) { return this.chat.requestReview(...args); }
  queueReview(...args) { return this.chat.queueReview(...args); }
  reviewQueue(...args) { return this.chat.reviewQueue(...args); }
  reviewDetail(...args) { return this.chat.reviewDetail(...args); }
}
