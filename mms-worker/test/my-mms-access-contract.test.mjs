import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { myMmsAccessContract } from '../src/my-mms-access-runtime.mjs';

const source = readFileSync(new URL('../src/my-mms-access-runtime.mjs', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../src/runtime-index-with-therapist-invite.js', import.meta.url), 'utf8');

test('MY MMS keeps onboarding /me separate from the approved work app', () => {
  assert.equal(myMmsAccessContract.self_access_path, '/male-massage/therapists/api/app/access');
  assert.equal(myMmsAccessContract.app_route, '/male-massage/therapists/app');
  assert.deepEqual([...myMmsAccessContract.states], ['locked', 'approved', 'revoked']);
  assert.equal(myMmsAccessContract.fail_closed_default, 'locked');
  assert.doesNotMatch(source, /app_route:\s*"\/male-massage\/therapists\/me"/);
});

test('MY MMS self access is session-bound and fail closed', () => {
  assert.match(source, /__Secure-mms_therapist_session/);
  assert.match(source, /requireCurrentTherapist/);
  assert.match(source, /access === "Approved"/);
  assert.match(source, /MY_MMS_ACCESS_REQUIRED/);
  assert.match(source, /return MY_MMS_VALUES\.has\(cleanValue\) \? cleanValue : "Locked"/);
});

test('MY MMS admin access is a separate entitlement from therapist status and matching', () => {
  assert.match(source, /"MY MMS Access"/);
  assert.match(source, /"MY MMS Approved At"/);
  assert.match(source, /"MY MMS Approved By"/);
  assert.match(source, /"MY MMS Review Note"/);
  assert.match(source, /my_mms_access/);
  assert.match(source, /admin_alias_pattern/);
});

test('admin snapshot is augmented with persisted MY MMS entitlement state', () => {
  assert.match(wrapper, /augmentAdminSnapshotWithMyMmsAccess/);
  assert.match(wrapper, /\/internal\/mms\/admin\/snapshot/);
  assert.match(source, /listAccessMap/);
  assert.match(source, /my_mms_can_open/);
});
