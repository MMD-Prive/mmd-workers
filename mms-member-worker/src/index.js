import { DurableObject } from 'cloudflare:workers';
import { MemberAccountStore } from './account-store.mjs';
import { handleMemberRequest } from './runtime.mjs';

export class MmsMemberAccount extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.account = new MemberAccountStore(ctx.storage);
  }
  openSession(...args) { return this.account.openSession(...args); }
  view(...args) { return this.account.view(...args); }
  saveProfile(...args) { return this.account.saveProfile(...args); }
  logout(...args) { return this.account.logout(...args); }
}

export default { fetch: handleMemberRequest };
