import { CAPABILITIES } from "./member-entitlement-resolver.js";

const PRIVATE_DRIVE = new Set([
  CAPABILITIES.PRIVATE_STANDARD,
  CAPABILITIES.PRIVATE_PREMIUM,
  CAPABILITIES.VIP,
  CAPABILITIES.SVIP,
  CAPABILITIES.BLACK_CARD,
]);

const PREMIUM_DRIVE = new Set([
  CAPABILITIES.PRIVATE_PREMIUM,
  CAPABILITIES.VIP,
  CAPABILITIES.SVIP,
  CAPABILITIES.BLACK_CARD,
]);

const TELEGRAM_ROOM_BY_CAPABILITY = Object.freeze({
  [CAPABILITIES.VIP]: "vip",
  [CAPABILITIES.SVIP]: "svip",
  [CAPABILITIES.BLACK_CARD]: "black",
});

export function planDownstreamAccess(snapshot, current = {}) {
  const currentDrive = unique(current.drive_layers);
  const currentTelegram = unique(current.telegram_rooms);
  const invalid = !snapshot || snapshot.schema_version !== "my_mmd_entitlement_resolver_v1";
  const blocked = invalid || snapshot.member_blocked === true;
  const active = new Set(snapshot?.capability_state?.active || []);
  const grace = new Set(snapshot?.capability_state?.grace || []);
  const access = snapshot?.access || {};

  if (blocked) return plan([], [], currentDrive, currentTelegram, "fail_closed");

  const activeDrive = [];
  if ([...active].some((cap) => PRIVATE_DRIVE.has(cap))) activeDrive.push("standard");
  if ([...active].some((cap) => PREMIUM_DRIVE.has(cap))) activeDrive.push("premium");

  const activeTelegram = [];
  for (const cap of active) {
    const room = TELEGRAM_ROOM_BY_CAPABILITY[cap];
    if (room) activeTelegram.push(room);
  }

  const graceDrive = [];
  if ([...grace].some((cap) => PRIVATE_DRIVE.has(cap))) graceDrive.push("standard");
  if ([...grace].some((cap) => PREMIUM_DRIVE.has(cap))) graceDrive.push("premium");

  const graceTelegram = [];
  for (const cap of grace) {
    const room = TELEGRAM_ROOM_BY_CAPABILITY[cap];
    if (room) graceTelegram.push(room);
  }

  const targetDrive = access.new_drive_grants_allowed === true
    ? unique(activeDrive)
    : currentDrive.filter((layer) => graceDrive.includes(layer));
  const targetTelegram = access.new_telegram_grants_allowed === true && access.new_protected_grants_allowed === true
    ? unique(activeTelegram)
    : currentTelegram.filter((room) => graceTelegram.includes(room));

  return plan(targetDrive, targetTelegram, currentDrive, currentTelegram, grace.size ? "grace_no_new_grants" : "resolver_authoritative");
}

function plan(targetDrive, targetTelegram, currentDrive, currentTelegram, reason) {
  return {
    schema_version: "my_mmd_downstream_reconciliation_v1",
    authority: "my_mmd_entitlement_resolver_v1",
    desired: {
      drive_layers: [...targetDrive],
      telegram_rooms: [...targetTelegram],
    },
    drive: diff(targetDrive, currentDrive),
    telegram: diff(targetTelegram, currentTelegram),
    reason,
  };
}

function diff(target, current) {
  const targetSet = new Set(target);
  const currentSet = new Set(current);
  return {
    grant: target.filter((value) => !currentSet.has(value)),
    retain: target.filter((value) => currentSet.has(value)),
    revoke: current.filter((value) => !targetSet.has(value)),
  };
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))];
}
