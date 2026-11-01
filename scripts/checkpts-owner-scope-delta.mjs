import assert from 'node:assert/strict';

// The active artifact contains an owner-only guard absent from the main source
// tree. Patch that guard in place; never replace the whole live Worker bundle.
export const OWNER_SCOPE_BEFORE = 'if (enabled7(env.KENJI_LINE_MODEL_ONLY_ENABLED)) {';
export const OWNER_SCOPE_AFTER = 'if (enabled7(env.KENJI_LINE_MODEL_ONLY_ENABLED) && !isCheckptsShortcut(event)) {';

export function patchCheckptsOwnerScope(source) {
  assert.equal(typeof source, 'string');
  assert.equal(source.split(OWNER_SCOPE_BEFORE).length, 2, 'Expected exactly one active owner guard');
  assert.equal(source.includes(OWNER_SCOPE_AFTER), false, 'Already patched; stop');
  const candidate = source.replace(OWNER_SCOPE_BEFORE, OWNER_SCOPE_AFTER);
  assert.equal(candidate.replace(OWNER_SCOPE_AFTER, OWNER_SCOPE_BEFORE), source, 'Unrelated artifact delta');
  return candidate;
}
