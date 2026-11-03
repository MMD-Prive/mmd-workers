import { therapistWorkspaceReadiness } from './workspace-admin-runtime.mjs';

// Booking suggestions must be actionable in MY THERAPIST. Service, recipient
// and exact linked-zone checks remain with the existing matching owner.
export function isBookingTherapistEligible(record) {
  const ready = therapistWorkspaceReadiness(record);
  return ready.can_open === true &&
    ready.matching_enabled === true &&
    !record.fields?.['Manual Review Only'] &&
    ready.availability_status === 'Available';
}
