import { DurableObject } from "cloudflare:workers";
import { createMmsTherapistScheduleCoordinator } from "./my-mms-therapist-schedule-store.mjs";

export const MmsTherapistScheduleCoordinator = createMmsTherapistScheduleCoordinator(DurableObject);
