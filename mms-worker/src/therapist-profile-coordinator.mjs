import { DurableObject } from 'cloudflare:workers';
import { createMmsTherapistProfileCoordinator } from './therapist-profile-coordinator-store.mjs';
export const MmsTherapistProfileCoordinator = createMmsTherapistProfileCoordinator(DurableObject);
