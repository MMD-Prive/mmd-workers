import {WorkerEntrypoint} from 'cloudflare:workers';
import {confirmPrivateJob,createPrivateJob,readPrivateModelJobs,readPrivateRequests} from './served-adapter.mjs';

export class PrivateBookingOwnerQa extends WorkerEntrypoint {
  createJob(ownerId, input) {
    return createPrivateJob(this.env, ownerId, input);
  }

  readRequests(ownerId, clientId) {
    return readPrivateRequests(this.env, ownerId, clientId);
  }
}

export class PrivateBookingModelQa extends WorkerEntrypoint {
  confirmJob(modelId, input) {
    return confirmPrivateJob(this.env, modelId, input);
  }

  readJobs(modelId, bookingRef) {
    return readPrivateModelJobs(this.env, modelId, bookingRef);
  }
}
