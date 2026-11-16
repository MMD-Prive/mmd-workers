import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const EXPECTED=Object.freeze({version:'f94ebccc-e8a0-4f3d-8c9b-3bf9e6cd39db',deployment:'8a419777-9b54-4fe3-ad82-fd48661706b6',js:'b67c9fdc16604215f59e12b2b504e6d8fe103397240808d129f230be52bba42f',map:'f9acc097f21769ff37bf697c4b6e28425108524142f0cf52d664f5ec99166e94'});
export const CANDIDATE = Object.freeze({js:'9ce16a84793622f06a2beed56d1165ec87d8329f148eddeee0524afca56085f8',map:'293d6271bb6b2d59ab151132ac4f2b184bda1d2fbee82b8513d31718126f7088'});
export const hash=b=>createHash('sha256').update(b).digest('hex');

export async function readVersionDigests(get, accountId, versionId) {
  assert.match(accountId, /^[a-f0-9]{32}$/i);
  assert.match(versionId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  const path = `/accounts/${accountId}/workers/workers/admin-worker/versions/${versionId}`;
  const response = await get(path, {include: 'modules,sourcemaps'});
  assert.equal(response?.success, true, 'Cloudflare readback failed');
  const version = response.result;
  assert.equal(version?.id, versionId, 'readback version mismatch');
  assert.equal(version.modules?.length, 2, 'incomplete or unexpected readback modules');
  function digest(name, type) {
    const matches = version.modules.filter(module => module.name === name);
    assert.equal(matches.length, 1, 'missing or duplicate module');
    const module = matches[0];
    assert.equal(module.content_type, type);
    assert.equal(typeof module.content_base64, 'string');
    const bytes = Buffer.from(module.content_base64, 'base64');
    assert.ok(bytes.length && bytes.toString('base64') === module.content_base64, 'invalid module bytes');
    return hash(bytes);
  }
  return {
    js: digest('admin-login-hero-worker.js', 'application/javascript+module'),
    map: digest('admin-login-hero-worker.js.map', 'application/source-map'),
  };
}

export const DELTA_SHA = 'f8047f186e10937a9a4c94b4a24e2d37ccdb47b9';
export const ENTRY = 'admin-login-hero-worker.js';

export function load3210Artifacts(directory, expected = CANDIDATE) {
  const code = readFileSync(join(directory, ENTRY));
  const map = readFileSync(join(directory, ENTRY + '.map'));
  assert.deepEqual({js: hash(code), map: hash(map)}, expected, 'candidate #3210 hash mismatch');
  return {code, map};
}
