import assert from 'node:assert/strict';

// Owner-supplied scope only. This module performs no network or mutation.
export function validateRetirementScope(scope, { zone, approvalRef }) {
  assert.ok(scope && typeof scope === 'object', 'approved route manifest required');
  assert.match(zone || '', /^[a-f0-9]{32}$/, 'exact zone ID required');
  assert.equal(scope.zone, zone, 'route zone mismatch');
  assert.equal(scope.script, 'mmd-redirect-worker', 'route script mismatch');
  assert.ok(approvalRef?.trim(), 'approval reference required');
  assert.equal(scope.approval_ref, approvalRef, 'route approval reference mismatch');
  assert.ok(Array.isArray(scope.routes) && scope.routes.length > 0, 'exact approved routes required');
  const ids = new Set(), patterns = new Set();
  for (const route of scope.routes) {
    assert.match(route.id || '', /^[a-f0-9]{32}$/, 'exact route ID required');
    assert.ok(typeof route.pattern === 'string' && route.pattern.trim() === route.pattern && route.pattern.length, 'exact route pattern required');
    assert.equal(route.script, scope.script, 'route owner mismatch');
    assert.ok(!ids.has(route.id) && !patterns.has(route.pattern), 'duplicate route scope');
    ids.add(route.id); patterns.add(route.pattern);
  }
  return scope;
}

export function selectRetirementRoutes(scope, inventory) {
  assert.ok(Array.isArray(inventory), 'route inventory unavailable');
  const legacy = inventory.filter(route => route.script === scope.script);
  assert.equal(legacy.length, scope.routes.length, 'live route scope changed');
  for (const expected of scope.routes) {
    const live = inventory.find(route => route.id === expected.id);
    assert.ok(live && live.pattern === expected.pattern && live.script === expected.script, 'live route owner or pattern changed');
  }
  return scope.routes;
}

export function assertRouteStillApproved(scope, route, inventory) {
  assert.ok(Array.isArray(inventory), 'route inventory unavailable');
  const approved = scope.routes.find(item => item.id === route.id);
  assert.ok(approved && approved.pattern === route.pattern && approved.script === route.script, 'route outside approved scope');
  const live = inventory.find(item => item.id === route.id);
  assert.ok(live && live.pattern === approved.pattern && live.script === approved.script, 'route changed before deletion');
}

export function selectRollbackRoutes(scope, deleted, inventory) {
  assert.ok(Array.isArray(deleted) && Array.isArray(inventory), 'rollback evidence unavailable');
  const ids = new Set();
  for (const route of deleted) {
    const approved = scope.routes.find(item => item.id === route.id);
    assert.ok(approved && approved.pattern === route.pattern && approved.script === route.script, 'rollback outside approved scope');
    assert.ok(!ids.has(route.id), 'duplicate deletion evidence');
    ids.add(route.id);
  }
  // Never replace a route that has been re-created or reassigned by another owner.
  return deleted.filter(route => !inventory.some(item => item.id === route.id || item.pattern === route.pattern));
}
