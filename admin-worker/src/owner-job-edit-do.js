import { JobEditJournal } from './owner-job-edit-coordinator.js';
export class JobEditCoordinator {
  constructor(ctx,env){this.journal=new JobEditJournal(ctx.storage,env);}
  fetch(request){return this.journal.fetch(request);}
}
