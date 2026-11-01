import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const DEFAULT_MANIFEST = 'workers/my-mms-customer-ui/release/manifest.json';

export function readMyMmsRelease(manifestPath = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.repository !== 'MMD-Prive/my-mms-therapist'
      || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
      || !/^[a-f0-9]{40}$/.test(manifest.sourceTree)
      || !Number.isInteger(manifest.sourceFileCount) || manifest.sourceFileCount < 1
      || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw Error('Invalid MY MMS release manifest');
  }
  const short = manifest.sourceCommit.slice(0, 7);
  if (manifest.archive !== `my-mms-customer-source-${short}.tar.gz` || manifest.tag !== `mms-ui-${short}`) {
    throw Error('MY MMS archive/tag does not match pinned source commit');
  }
  const archivePath = resolve(dirname(manifestPath), manifest.archive);
  const actual = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
  if (actual !== manifest.sha256) throw Error('MY MMS source archive checksum mismatch');
  return { manifest, archivePath };
}

export function prepareMyMmsRelease(manifestPath = DEFAULT_MANIFEST, target = '.release/my-mms-customer') {
  const release = readMyMmsRelease(manifestPath);
  if (existsSync(target) && readdirSync(target).length) throw Error('MY MMS release target must be empty');
  mkdirSync(target, { recursive: true });
  const result = spawnSync('tar', ['-xzf', release.archivePath, '-C', target], { stdio: 'inherit' });
  if (result.status !== 0) throw Error('MY MMS source extraction failed');
  return release.manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = prepareMyMmsRelease();
  console.log(`Prepared ${manifest.repository}@${manifest.sourceCommit} (${manifest.sourceFileCount} source files)`);
}
