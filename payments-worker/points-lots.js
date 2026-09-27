// Server-side domain logic. Caller must authenticate, resolve the canonical member,
// and persist each transition atomically before acknowledging it. No HTTP ingress.
export const POINTS_TTL_MS = 365 * 86400000;

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
function instant(value) {
  const ms = Date.parse(value);
  requireValue(Number.isFinite(ms), "invalid_timestamp");
  return ms;
}
function key(value) {
  requireValue(typeof value === "string" && value.length > 0 && value.length <= 200, "invalid_reference");
  return value;
}
function amount(value) {
  requireValue(Number.isSafeInteger(value) && value > 0, "invalid_points");
  return value;
}
export function newPointsWallet(memberId) {
  return { memberId: key(memberId), lots: [], reservations: [] };
}
function remaining(wallet, lot, now) {
  let held = 0;
  let spent = 0;
  for (const reservation of wallet.reservations) {
    const used = reservation.allocations.filter(a => a.lotId === lot.id).reduce((s, a) => s + a.points, 0);
    if (reservation.status === "spent") spent += used;
    if (reservation.status === "reserved" && instant(reservation.holdUntil) > now) held += used;
  }
  requireValue(spent + held <= lot.points, "wallet_inconsistent");
  return { held, spent, available: lot.points - spent - held };
}
export function pointsSnapshot(wallet, nowIso) {
  const now = instant(nowIso);
  const lots = wallet.lots.map(lot => {
    const value = remaining(wallet, lot, now);
    const expired = instant(lot.expiresAt) <= now;
    return { ...lot, spent: value.spent, reserved: expired ? 0 : value.held,
      available: expired ? 0 : value.available, expired: expired ? lot.points - value.spent : 0 };
  });
  const available = lots.reduce((s, l) => s + l.available, 0);
  requireValue(Number.isSafeInteger(available), "wallet_overflow");
  return { available, reserved: lots.reduce((s, l) => s + l.reserved, 0),
    expired: lots.reduce((s, l) => s + l.expired, 0),
    spent: lots.reduce((s, l) => s + l.spent, 0),
    expirySchedule: lots.filter(l => l.available + l.reserved > 0)
      .map(l => ({ lotId: l.id, points: l.available + l.reserved, expiresAt: l.expiresAt }))
      .sort((a, b) => instant(a.expiresAt) - instant(b.expiresAt)), lots };
}

// Input amounts/source references come from the trusted canonical service, never
// from a customer's supplied balance. Historical import time is fixed on first award.
export function transitionPoints(wallet, command, nowIso) {
  const now = instant(nowIso);
  requireValue(command.memberId === wallet.memberId, "member_mismatch");
  const next = structuredClone(wallet);
  const ref = key(command.reference);
  if (command.type === "award") {
    const points = amount(command.points);
    const prior = next.lots.find(l => l.id === ref);
    if (prior) {
      requireValue(prior.points === points, "idempotency_conflict");
      return next;
    }
    next.lots.push({ id: ref, points, enteredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + POINTS_TTL_MS).toISOString() });
  } else if (command.type === "reserve") {
    const points = amount(command.points);
    const holdUntil = instant(command.holdUntil);
    const prior = next.reservations.find(r => r.id === ref);
    if (prior) {
      requireValue(prior.points === points && instant(prior.holdUntil) === holdUntil, "idempotency_conflict");
      return next;
    }
    requireValue(holdUntil > now, "hold_expired");
    let needed = points;
    const allocations = [];
    const candidates = next.lots.filter(l => instant(l.expiresAt) >= holdUntil)
      .sort((a, b) => instant(a.expiresAt) - instant(b.expiresAt) || a.id.localeCompare(b.id));
    for (const lot of candidates) {
      const take = Math.min(remaining(next, lot, now).available, needed);
      if (take > 0) allocations.push({ lotId: lot.id, points: take });
      needed -= take;
      if (needed === 0) break;
    }
    requireValue(needed === 0, "insufficient_unexpired_points");
    next.reservations.push({ id: ref, points, holdUntil: new Date(holdUntil).toISOString(),
      status: "reserved", allocations });
  } else {
    requireValue(["capture", "release", "refund"].includes(command.type), "unknown_action");
    const reservation = next.reservations.find(r => r.id === ref);
    requireValue(reservation, "reservation_not_found");
    const target = { capture: "spent", release: "released", refund: "refunded" }[command.type];
    if (reservation.status === target) return next;
    if (command.type === "capture") {
      requireValue(reservation.status === "reserved", "invalid_transition");
      requireValue(instant(reservation.holdUntil) > now, "hold_expired");
      requireValue(reservation.allocations.every(a => instant(next.lots.find(l => l.id === a.lotId).expiresAt) > now), "points_expired");
    } else {
      requireValue(reservation.status === (command.type === "refund" ? "spent" : "reserved"), "invalid_transition");
    }
    reservation.status = target;
    reservation.changedAt = new Date(now).toISOString();
    // Refund/release restores the original lots, including their original expiry.
  }
  pointsSnapshot(next, nowIso);
  return next;
}
