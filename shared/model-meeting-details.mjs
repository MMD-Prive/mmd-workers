const fail = code => { throw Object.assign(new Error(code), {code,status:400}); };
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value)) fail('meeting_details_invalid');
  const clean = value.trim();
  if (required && !clean) fail('meeting_details_required');
  return clean;
};
const object = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('meeting_details_invalid');
};
export const MEETING_TRANSPORTS = Object.freeze(['grab_taxi','private_car','other']);

export function normalizeMeetingDetails(input) {
  object(input,['venue_type','meeting_point','house_number','building','floor','room_number','security_requires_room','pickup_required','vehicle_access_note']);
  if (!['home','condo','hotel'].includes(input.venue_type) || typeof input.security_requires_room !== 'boolean' || typeof input.pickup_required !== 'boolean') fail('meeting_details_invalid');
  const home = input.venue_type === 'home';
  const house = text(input.house_number ?? '',40,home), room = text(input.room_number ?? '',40,!home && input.security_requires_room);
  if (home && (room || input.security_requires_room)) fail('meeting_details_invalid');
  if (!home && house) fail('meeting_details_invalid');
  return {venue_type:input.venue_type,meeting_point:text(input.meeting_point,180,true),house_number:house,
    building:text(input.building ?? '',100),floor:text(input.floor ?? '',20),room_number:room,
    security_requires_room:input.security_requires_room,pickup_required:input.pickup_required,
    vehicle_access_note:text(input.vehicle_access_note ?? '',240)};
}

export function normalizeTravelTransport(input) {
  object(input,['mode']);
  if (!MEETING_TRANSPORTS.includes(input.mode)) fail('transport_mode_invalid');
  return {mode:input.mode};
}

export function normalizeWrongLocation(input) {
  object(input,['current_place','eta_minutes','transport_mode','report_id']);
  if (!MEETING_TRANSPORTS.includes(input.transport_mode)) fail('transport_mode_invalid');
  if (typeof input.eta_minutes !== 'number' || !Number.isInteger(input.eta_minutes) || input.eta_minutes < 1 || input.eta_minutes > 240) fail('eta_minutes_invalid');
  if (typeof input.report_id !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(input.report_id)) fail('location_report_id_invalid');
  return {current_place:text(input.current_place,240,true),eta_minutes:input.eta_minutes,transport_mode:input.transport_mode,report_id:input.report_id};
}
