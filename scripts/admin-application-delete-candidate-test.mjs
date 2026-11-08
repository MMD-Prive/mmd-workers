// Run existing mocked business/browser contracts against the actual overlaid
// production artifact. No production requests or credential access.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
export function testCandidate(code) {
  const directory = mkdtempSync(join(tmpdir(), 'application-delete-candidate-test-'));
  const artifact = join(directory, 'candidate.mjs');
  writeFileSync(artifact, code + '\nexport { isPublicModelApplicationReviewRequest, handlePublicModelApplicationReviewRequest, handlePublicModelReviewDurableMutation };\n');
  const original = pathToFileURL(resolve('admin-worker/src/public-model-application-review.js')).href;
  writeFileSync(join(directory, 'review.mjs'), `export { PUBLIC_MODEL_REVIEW_FIELDS, PUBLIC_MODEL_ASSET_FIELDS } from ${JSON.stringify(original)};\nexport { isPublicModelApplicationReviewRequest, handlePublicModelApplicationReviewRequest, handlePublicModelReviewDurableMutation } from './candidate.mjs';\n`);
  const files = ['public-model-review-test-coordinator.mjs', 'public-model-application-delete.test.mjs', 'public-model-application-review.test.mjs', 'public-model-onboarding.test.mjs'];
  for (const file of files) {
    let source = readFileSync('admin-worker/' + file, 'utf8');
    source = source.replace(/(["'])\.\/src\/([^"']+)\1/g, (_, quote, name) => {
      const destination = name === 'public-model-application-review.js' ? './review.mjs'
        : name === 'model-first-time-activation.js' ? './candidate.mjs'
        : pathToFileURL(resolve('admin-worker/src', name)).href;
      return JSON.stringify(destination);
    });
    writeFileSync(join(directory, file), source);
  }
  const env = { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, NODE_NO_WARNINGS: '1' };
  execFileSync(process.execPath, ['--check', artifact], { env, stdio: 'pipe' });
  const output = execFileSync(process.execPath, ['--test', ...files.filter(x => x.endsWith('.test.mjs')).map(x => join(directory, x))],
    { env, stdio: 'pipe', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }).toString();
  return { directory, output };
}
