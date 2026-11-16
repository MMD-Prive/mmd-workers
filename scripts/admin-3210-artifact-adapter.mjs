import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const EXPECTED = Object.freeze({
  version: '98614455-f94e-4b35-90c1-c01474af6912',
  deployment: '108e0ed0-c103-49ed-a58d-e5eed475149d',
  js: 'b37cbdac91214cc2a6bf3ad80efe94038e46fe9b3a60108ea2563eb36acd8b1a',
  map: 'd4103e813cd5b0ae7cbd33bfd401e3a8e4421d4de449090870a084ccf7f9fc84',
});
export const CANDIDATE = Object.freeze({
  js: '42598aa308b5256c4ef619b370cd6e703c4ae5de8360198b3c278c76fa37acd7',
  map: 'd7c688f2edc7f158957ab25e955d0d4ec346dac2df7e24d7a2ccd1c9878e2d96',
});
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
