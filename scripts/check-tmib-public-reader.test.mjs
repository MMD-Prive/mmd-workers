import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConfiguredTmibCandidate, assertTmibPublicReaderArtifact } from './check-tmib-public-reader.mjs';

// This is the actual configured runtime, with real public/member modules bundled.
const artifact = await buildConfiguredTmibCandidate();
const source = Buffer.from(artifact).toString('utf8');
const defaultName = /(\w+) as default/.exec(source)?.[1];
assert.ok(defaultName);
function changedFetch(body) {
  return Buffer.from(source + `\nconst tmibOriginalFetch=${defaultName}.fetch;\n${defaultName}.fetch=async(request,env,ctx)=>{${body}};`);
}

test('ordinary configured build retains 221 paragraphs and 40 signed images without member I/O', () => {
  assert.deepEqual(assertTmibPublicReaderArtifact(artifact), {
    episodes: 2, paragraphs: 221, images: 40, ep03: 'pending', calls: { network: 0, bindings: 0, background: 0 },
  });
});

test('the real missing-route regression is rejected before release', () => {
  const broken = changedFetch(`if(request.url.includes('ep01/content'))return Response.json({ok:false,error:{code:'LIFF_ROUTE_NOT_FOUND'}},{status:404});return tmibOriginalFetch(request,env,ctx);`);
  assert.throws(() => assertTmibPublicReaderArtifact(broken), /TMIB_RELEASE_BLOCKED/);
});

test('a complete-looking episode with one paragraph missing is rejected', () => {
  const broken = changedFetch(`const response=await tmibOriginalFetch(request,env,ctx);if(request.url.includes('ep02/content')){const data=await response.json();data.story.narration[0].paragraphs.pop();return Response.json(data);}return response;`);
  assert.throws(() => assertTmibPublicReaderArtifact(broken), /TMIB_RELEASE_BLOCKED/);
});

test('premature EP03 publication is rejected even when EP01/02 are intact', () => {
  const broken = changedFetch(`if(request.url.includes('ep03/content'))return Response.json({ok:true,granted:true,story:{},media:{}});return tmibOriginalFetch(request,env,ctx);`);
  assert.throws(() => assertTmibPublicReaderArtifact(broken), /TMIB_RELEASE_BLOCKED/);
});

test('session or storage dependencies cannot creep back into public reading', () => {
  const broken = changedFetch(`env.LIFF_IDENTITY_KV.get('session');return tmibOriginalFetch(request,env,ctx);`);
  assert.throws(() => assertTmibPublicReaderArtifact(broken), /TMIB_RELEASE_BLOCKED/);
});

test('a substituted image on the same CDN fails the approved 40-image digest', () => {
  const broken = changedFetch(`const response=await tmibOriginalFetch(request,env,ctx);if(new URL(request.url).pathname.endsWith('act-001-ep01/media/05'))return Response.redirect('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/wrong.webp',307);return response;`);
  assert.throws(() => assertTmibPublicReaderArtifact(broken), /TMIB_RELEASE_BLOCKED/);
});

test('gate follows wrangler main instead of testing a detached public handler', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tmib-wrong-entry-'));
  try {
    mkdirSync(join(dir, 'member-pages-worker/src'), { recursive: true });
    writeFileSync(join(dir, 'member-pages-worker/wrangler.toml'), 'main = "src/replaced.js"\n');
    writeFileSync(join(dir, 'member-pages-worker/src/replaced.js'), 'export default {fetch(){return new Response("missing",{status:404})}}');
    const wrongArtifact = await buildConfiguredTmibCandidate(dir);
    assert.throws(() => assertTmibPublicReaderArtifact(wrongArtifact), /TMIB_RELEASE_BLOCKED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('production workflows require the candidate gate before direct deployment', () => {
  for (const [file, boundary] of [
    ['deploy-member-pages-worker.yml', '- name: Validate Cloudflare deploy'],
    ['care-back-prod-trusted-caller-rollout.yml', '- name: Generate one shared trusted-caller secret'],
  ]) {
    const workflow = readFileSync(new URL('../.github/workflows/' + file, import.meta.url), 'utf8');
    const gate = workflow.indexOf('npm run check:tmib-public-reader');
    assert.ok(gate >= 0 && gate < workflow.indexOf(boundary), file);
  }
});
