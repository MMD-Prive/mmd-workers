import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function uploadMmsVersion({ config, run, tag, message, secretsFile, allowMigration = false }) {
  if (config.name !== 'mms-worker' || (config.routes || []).length || config.route || (config.triggers?.crons || []).length) {
    throw Error('MMS migration deployment must use the route-free mms-worker config');
  }
  const flags = ['--keep-vars', '--env=', '--tag', tag, '--message', message];
  if (secretsFile) flags.push('--secrets-file', secretsFile);
  const upload = ['versions', 'upload', ...flags];
  const first = run(upload);
  if (first.status === 0) return { ...first, migrationApplied: false };
  const confirmedMigration = /\[code:\s*10211\]/.test(first.output)
    && /includes a Durable Object migration, but migrations must be fully applied via a non-versioned deployment/.test(first.output);
  if (!confirmedMigration) throw Error('Version upload failed without confirmed Cloudflare migration error 10211; refusing direct deploy');
  if (!allowMigration) throw Error('Migration requires separate explicit approval; refusing direct deploy');
  if (!(config.migrations || []).length) throw Error('Cloudflare reported migration 10211 but config has no migrations');
  const direct = run(['deploy', ...flags]);
  if (direct.status !== 0) throw Error('MMS migration deployment failed; refusing version promotion');
  const retry = run(upload);
  if (retry.status !== 0) throw Error('MMS version upload failed after migration deployment; refusing version promotion');
  return { ...retry, migrationApplied: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = JSON.parse(readFileSync(new URL('../mms-worker/wrangler.jsonc', import.meta.url), 'utf8'));
    const sha = process.env.GITHUB_SHA || '';
    if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('GITHUB_SHA is required');
    const result = uploadMmsVersion({
      config, tag: `gha-${sha.slice(0, 12)}`, message: `GitHub Actions ${sha}`, secretsFile: process.argv[2] || undefined,
      run(args) {
        const result = spawnSync('npx', ['wrangler', ...args], { cwd: fileURLToPath(new URL('../mms-worker', import.meta.url)), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        const output = (result.stdout || '') + (result.stderr || '');
        process.stdout.write(output);
        return { status: result.status ?? 1, output };
      },
    });
    // Existing workflow resolves and promotes only the successful upload's ID.
    writeFileSync(`${process.env.RUNNER_TEMP}/mms-worker-upload.log`, result.output, { mode: 0o600 });
    if (process.env.GITHUB_ENV) writeFileSync(process.env.GITHUB_ENV, `MMS_WORKER_MIGRATION_APPLIED=${result.migrationApplied}\n`, { flag: 'a' });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
