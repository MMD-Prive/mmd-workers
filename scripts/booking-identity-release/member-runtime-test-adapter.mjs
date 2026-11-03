// Execute the release module unchanged. Only platform I/O is supplied by fixtures.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash, webcrypto } from 'node:crypto';
import { registerHooks } from 'node:module';
// Node lacks Cloudflare platform base classes. These exports only permit defining
// unrelated named entrypoint classes. Construction is forbidden: no RPC/DO path
// is modeled or silently stubbed by the default-fetch identity tests.
const platformModule = 'data:text/javascript,' + encodeURIComponent(`
  export class WorkerEntrypoint { constructor() { throw Error('Unexpected WorkerEntrypoint construction in identity test'); } }
  export class DurableObject { constructor() { throw Error('Unexpected DurableObject construction in identity test'); } }
`);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: platformModule, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadCompiledMemberWorker(path) {
  globalThis.crypto ||= webcrypto;
  const absolute = resolve(path);
  const bytes = await readFile(absolute);
  const sha256 = digest(bytes);
  const directory = await mkdtemp(join(tmpdir(), 'member-artifact-runtime-'));
  const temporary = join(directory, 'worker.mjs');
  try {
    // The .mjs copy selects ESM without substituting source, rewriting exports,
    // injecting helpers, or changing any byte of the release artifact.
    await writeFile(temporary, bytes);
    if (digest(await readFile(temporary)) !== sha256) throw Error('Temporary module differs from release artifact');
    const module = await import(pathToFileURL(temporary).href);
    if (typeof module.default?.fetch !== 'function') throw Error('Compiled artifact has no default fetch entrypoint');
    return { worker: module.default, sha256, bytes: bytes.length, path: absolute };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
