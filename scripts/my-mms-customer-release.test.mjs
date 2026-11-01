import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { readMyMmsRelease, prepareMyMmsRelease, DEFAULT_MANIFEST } from './my-mms-customer-release.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mms-release-'));
  cpSync(dirname(DEFAULT_MANIFEST), root, { recursive: true });
  return { root, path: join(root, 'manifest.json'), close: () => rmSync(root, { recursive: true, force: true }) };
}
test('approved package extracts the customer skin, live search and ETA source together', () => {
  const f = fixture();
  try {
    const target = join(f.root, 'source');
    const manifest = prepareMyMmsRelease(f.path, target);
    assert.equal(manifest.sourceCommit, '8b4d2356e602df0a146d8c65bdb28ea123cdd313');
    assert.match(readFileSync(join(target, 'src/customer-skin-v3.css'), 'utf8'), /customer-v3/);
    assert.match(readFileSync(join(target, 'src/components/mms/matching-search.tsx'), 'utf8'), /useTherapistSearch/);
    assert.match(readFileSync(join(target, 'src/routes/index.tsx'), 'utf8'), /formatEtaLabel/);
    assert.throws(() => prepareMyMmsRelease(f.path, target), /must be empty/);
  } finally { f.close(); }
});
test('corrupted source archive is rejected before extraction', () => {
  const f = fixture();
  try {
    const { archivePath } = readMyMmsRelease(f.path);
    writeFileSync(archivePath, 'corrupted');
    assert.throws(() => prepareMyMmsRelease(f.path, join(f.root, 'source')), /checksum mismatch/);
  } finally { f.close(); }
});
test('mismatched commit and archive cannot be published under an old release tag', () => {
  const f = fixture();
  try {
    const m = JSON.parse(readFileSync(f.path, 'utf8'));
    m.tag = 'mms-ui-2f0bb09'; writeFileSync(f.path, JSON.stringify(m));
    assert.throws(() => readMyMmsRelease(f.path), /does not match pinned source/);
  } finally { f.close(); }
});
