// Checkpts-only artifact preparation and explicitly approved release. No rebuild.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, writeSync, fsyncSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PIN = Object.freeze({
  worker: 'member-dashboard-chat-worker', account: 'b176eda1172b741fd2e58904cc9d77c5',
  zone: '2d62396174fa2ddadbbcd0e8cf0f3367', merge: 'e554f893b672919e1436ef844581c40eb6165bfb',
  version: '428fde80-3778-4a63-a719-5ebd85333a59', deployment: '8dfb5dca-b56a-4332-8b1d-830e14f79592',
  module: 'guide-notification-entry.js',
  js: 'a0414fb5356605698b9b2539573d66b1135111f00fcc01ed545d8df125c43956',
  map: 'ab299504d8640f02052ec4ce3428f8704d6fcc3dd3ef25092cc9abb8370fefc7',
  handler: 'e4a663eebee5a45d05c134167878c0d2b313ad3b5175ce9a0d704abdb6633b1e',
  source: 'member-dashboard-chat-worker/src/kenji-lv5-line-operational-request.mjs',
  sourceBefore: '7ad2aa244ba04518e446ac15e03a875e211a2d7f36828c5cbfb0ce015185ea4e',
  sourceAfter: 'f2e382367ea141ed56b7b9f3a6f50d0df447621802a263ef52797865cd18a404',
});
export const ROOT = `/accounts/${PIN.account}/workers/scripts/${PIN.worker}`;
const ROUTES = `/zones/${PIN.zone}/workers/routes`;
export const GUARD = '  if (isCheckptsShortcut(event)) return null;\n';
const ANCHOR = '  const currentIntent = inferLineIntent(raw, event);\n';
const IMPORT = 'import { isCheckptsShortcut } from "./checkpts-command.mjs";\n';
const COMMENT = '  // Let the existing Checkpts lane enforce truth and reply guards before any\n  // pending booking draft can consume the command as customer input.\n';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const digest = value => hash(JSON.stringify(canonical(value)));
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
export function toolchain() {
  const require = createRequire(path.resolve(process.env.CHECKPTS_TOOLS_DIR || '/private/tmp/checkpts-artifact-tools', 'package.json'));
  assert.equal(require('esbuild').version, '0.27.3');
  assert.equal(require('@jridgewell/sourcemap-codec/package.json').version, '1.6.0');
  return { ...require('@jridgewell/sourcemap-codec'), build: require('esbuild').build };
}
function unique(text, marker) {
  const n = text.indexOf(marker);
  assert.ok(n >= 0 && text.indexOf(marker, n + marker.length) < 0, 'missing/ambiguous reviewed anchor');
  return n;
}
export function handler(code) {
  const start = unique(code, 'async function tryHandleKenjiLv5LineOperationalRequest(');
  const end = code.indexOf('\n}\n', start) + 3;
  assert.ok(end > start);
  return { start, end, text: code.slice(start, end) };
}
export async function assemble(js, mapText, reviewedSource) {
  assert.equal(hash(js), PIN.js, 'baseline JS drift');
  assert.equal(hash(mapText), PIN.map, 'baseline source map drift');
  assert.equal(hash(reviewedSource), PIN.sourceAfter, 'reviewed source drift');
  const before = handler(js); assert.equal(hash(before.text), PIN.handler, 'handler drift');
  unique(js, 'function isCheckptsShortcut(');
  assert.ok(!before.text.includes(GUARD.trim()), 'Checkpts guard already present');
  assert.ok(before.text.includes('if (careBackOctoberReply(currentIntent, raw, Date.now())) return null;'), 'CARE BACK guard missing');
  const at = before.start + unique(before.text, ANCHOR);
  const candidate = js.slice(0, at) + GUARD + js.slice(at);
  assert.equal(candidate.slice(0, at) + candidate.slice(at + GUARD.length), js, 'unrelated bytes changed');
  const map = JSON.parse(mapText), { decode, encode, build } = toolchain();
  const sourceIndex = map.sources.indexOf('src/kenji-lv5-line-operational-request.mjs');
  assert.ok(sourceIndex >= 0 && map.sources.lastIndexOf(map.sources[sourceIndex]) === sourceIndex);
  const original = map.sourcesContent[sourceIndex]; assert.equal(hash(original), PIN.sourceBefore);
  const importAnchor = 'import { careBackOctoberReply } from "./kenji-care-back-october.mjs";\n';
  const importAt = unique(original, importAnchor) + importAnchor.length;
  const guardAt = unique(original, ANCHOR);
  assert.equal(original.slice(0, importAt) + IMPORT + original.slice(importAt, guardAt) + COMMENT + GUARD + original.slice(guardAt), reviewedSource);
  const importLine = original.slice(0, importAt).split('\n').length - 1;
  const guardLine = original.slice(0, guardAt).split('\n').length - 1;
  const generatedLine = js.slice(0, at).split('\n').length - 1;
  const lines = decode(map.mappings);
  for (const line of lines) for (const segment of line) if (segment.length >= 4 && segment[1] === sourceIndex) {
    const old = segment[2]; segment[2] += Number(old >= importLine) + 3 * Number(old >= guardLine);
  }
  lines.splice(generatedLine, 0, []); // The only new compiled line is intentionally unmapped.
  const afterMap = { ...map, sourcesContent: map.sourcesContent.slice(), mappings: encode(lines) };
  afterMap.sourcesContent[sourceIndex] = reviewedSource;
  const exportsOf = async contents => {
    const r = await build({ stdin: { contents, loader: 'js' }, write: false, bundle: false, format: 'esm', metafile: true, logLevel: 'silent' });
    return Object.values(r.metafile.outputs)[0].exports.slice().sort();
  };
  const exports = await exportsOf(js); assert.deepEqual(await exportsOf(candidate), exports);
  const candidateMap = JSON.stringify(afterMap);
  return { code: candidate, map: candidateMap, manifest: {
    schema: 'checkpts-preserved-release.v1', source_merge: PIN.merge,
    baseline_version: PIN.version, baseline_deployment: PIN.deployment, module: PIN.module,
    baseline_js_sha256: PIN.js, baseline_map_sha256: PIN.map, baseline_handler_sha256: PIN.handler,
    candidate_js_sha256: hash(candidate), candidate_map_sha256: hash(candidateMap),
    candidate_handler_sha256: hash(handler(candidate).text), exports,
    inserted_guard: GUARD.trim(), inserted_generated_line: generatedLine,
    changed_source: map.sources[sourceIndex], source_sha256: PIN.sourceAfter,
    unrelated_runtime_bytes_equal: true, production_writes: 0,
  } };
}
export function safeBindings(bindings) {
  return bindings.map(b => /secret/i.test(b.type) || /TOKEN|SECRET|CREDENTIAL|PASSWORD|BEARER|KEY/i.test(b.name)
    ? { name: b.name, type: b.type, value_not_compared: true } : b).sort((a, b) => a.name.localeCompare(b.name));
}
function config(v) {
  return { runtime: v.resources.script_runtime, bindings: safeBindings(v.resources.bindings),
    handlers: v.resources.script.handlers, named: v.resources.script.named_handlers };
}
export function transport(token, { approved = false, request = fetch } = {}) {
  assert.ok(token, 'existing credential required');
  return async (method, p, body) => {
    const read = method === 'GET' && (p === ROUTES || p === ROOT || [ROOT+'/deployments', ROOT+'/versions', ROOT+'/settings', ROOT+'/schedules'].includes(p)
      || new RegExp('^'+ROOT+'/versions/[a-f0-9-]{36}$').test(p));
    const write = approved && method === 'POST' && p === ROOT+'/versions?bindings_inherit=strict';
    assert.ok(read || write, 'outside Checkpts-only transport scope');
    let response;
    try { response = await request('https://api.cloudflare.com/client/v4'+p, { method, redirect: 'error',
      signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer '+token,
        ...(body instanceof FormData ? {} : body ? {'Content-Type':'application/json'} : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }); }
    catch { throw Error('Cloudflare acknowledgement unavailable; reconcile with GET; never replay writes'); }
    assert.ok(response.ok, 'Cloudflare request failed; stop without retry');
    if (p === ROOT) return { text: await response.text(), etag: response.headers.get('etag')?.replaceAll('"','') };
    const data = await response.json(); assert.equal(data.success, true, 'Cloudflare operation unconfirmed'); return data.result;
  };
}
export async function inspect(io, expected, candidateVersion = null) {
  const d = (await io('GET', ROOT+'/deployments')).deployments[0];
  assert.equal(d.id, expected.deployment, 'deployment drift');
  assert.deepEqual(d.versions, [{version_id:expected.version,percentage:100}], 'allocation drift');
  const latest = (await io('GET', ROOT+'/versions')).items[0];
  assert.equal(latest.id, candidateVersion || expected.version, 'latest upload drift');
  const v = await io('GET', ROOT+'/versions/'+expected.version);
  const settings = await io('GET', ROOT+'/settings');
  assert.equal(digest(safeBindings(settings.bindings)), expected.config_fingerprints.safe_bindings, 'binding drift');
  assert.equal(digest(Object.fromEntries(Object.entries(settings).filter(([k])=>!['bindings','annotations'].includes(k)))), expected.config_fingerprints.settings_without_bindings, 'settings drift');
  assert.deepEqual(await io('GET',ROOT+'/schedules'),expected.schedules,'schedule drift');
  const routes = (await io('GET',ROUTES)).filter(r=>r.script===PIN.worker).sort((a,b)=>a.pattern.localeCompare(b.pattern));
  assert.equal(digest(routes),expected.routes_sha256,'route drift');
  const finalLatest=(await io('GET',ROOT+'/versions')).items[0];
  assert.equal(finalLatest.id,candidateVersion||expected.version,'latest upload changed during inspection');
  assert.deepEqual((await io('GET',ROOT+'/deployments')).deployments[0],d,'deployment changed during inspection');
  return { deployment:d,version:v,settings };
}
// One durable journal per Worker, outside candidate folders. CLI has no override.
export const STATE_ROOT = '/Users/Hiright_1/Documents/ChatGPT/Ricj Menu/checkpts-precedence-20261104/release-state';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PHASES = new Set(['upload_intent','upload_unknown','uploaded_unverified','upload_observed_unverified','verification_unavailable','legacy_unresolved','promotion_intent','promotion_unknown']);
export class Journal {
  constructor(root = STATE_ROOT) {
    this.root = root; this.file = path.join(root,PIN.worker+'.jsonl'); this.lock = path.join(root,PIN.worker+'.lock');
  }
  acquire() { mkdirSync(this.root,{recursive:true}); mkdirSync(this.lock); }
  unlock() { rmdirSync(this.lock); }
  read() {
    if(!existsSync(this.file))return [];
    const text=readFileSync(this.file,'utf8');assert.ok(text.length>0&&text.endsWith('\n'),'empty/torn journal; reconcile without writes');
    const lines=text.split('\n').filter(Boolean);
    assert.ok(lines.length>0,'journal contains no records; reconcile without writes');
    let previous='';return lines.map(line=>{
      const entry=JSON.parse(line),{entry_hash,...body}=entry;
      assert.equal(entry_hash,digest(body),'journal corruption');assert.equal(body.previous_hash,previous,'journal history mismatch');
      assert.ok(PHASES.has(body.phase)&&UUID.test(body.attempt_id)&&body.worker===PIN.worker,'invalid journal entry');
      previous=entry_hash;return entry;
    });
  }
  append(state) {
    const history=this.read();const {entry_hash,previous_hash,at,...next}=state;
    const body={...next,worker:PIN.worker,at:new Date().toISOString(),previous_hash:history.at(-1)?.entry_hash||''};
    assert.ok(PHASES.has(body.phase)&&UUID.test(body.attempt_id),'invalid journal state');
    const entry={...body,entry_hash:digest(body)},bytes=Buffer.from(JSON.stringify(entry)+'\n');
    const fd=openSync(this.file,'a',0o600);
    try { assert.equal(writeSync(fd,bytes),bytes.length,'partial journal write');fsyncSync(fd); } finally {closeSync(fd);}
    const dir=openSync(this.root,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
    return entry;
  }
}
function artifacts(folder,approval) {
  const manifestText=readFileSync(path.join(folder,'manifest.json'),'utf8');
  assert.equal(approval?.sourceMerge,PIN.merge,'wrong approved source');
  assert.match(approval?.manifestSha256||'',/^[a-f0-9]{64}$/);
  assert.equal(hash(manifestText),approval.manifestSha256,'manifest not approved');
  const m=JSON.parse(manifestText),baselineText=readFileSync(path.join(folder,'baseline.json'),'utf8');
  assert.equal(hash(baselineText),m.baseline_configuration_sha256,'baseline configuration tampered');
  assert.equal(m.release_protocol,'checkpts-upload-only.v2','old execution protocol');
  assert.equal(m.promotion_enabled,false,'promotion must remain disabled');
  const expected=JSON.parse(baselineText);
  assert.equal(m.source_merge,PIN.merge);assert.equal(m.baseline_js_sha256,PIN.js);assert.equal(m.baseline_map_sha256,PIN.map);
  assert.equal(expected.version,PIN.version);assert.equal(expected.deployment,PIN.deployment);
  const js=readFileSync(path.join(folder,PIN.module)),map=readFileSync(path.join(folder,PIN.module+'.map'));
  assert.equal(hash(js),m.candidate_js_sha256,'candidate JS tampered');assert.equal(hash(map),m.candidate_map_sha256,'candidate map tampered');
  return {m,expected,js,map};
}
const identity=(m,approval,expected)=>({source_merge:PIN.merge,manifest_sha256:approval.manifestSha256,baseline_version:PIN.version,
 baseline_deployment:PIN.deployment,baseline_config:expected,js_sha256:m.candidate_js_sha256,map_sha256:m.candidate_map_sha256});
export async function uploadReviewed({io,folder,approval,journal=new Journal()}) {
  assert.equal(approval?.approved,true,'explicit upload approval missing');
  assert.notEqual(process.env.GITHUB_ACTIONS,'true','CI upload disabled: shared release lock and durable cross-runner journal are not configured');
  const {m,expected,js,map}=artifacts(folder,approval);
  journal.acquire();
  try {
    // Any previous attempt blocks another upload, even from a copied artifact folder.
    assert.equal(journal.read().length,0,'existing attempt; use GET-only reconcile, never replay upload');
    const prior=path.join(folder,'release-receipt.json');
    if(existsSync(prior)) {
      JSON.parse(readFileSync(prior,'utf8')); // Malformed legacy receipts also fail closed.
      journal.append({...identity(m,approval,expected),attempt_id:randomUUID(),phase:'legacy_unresolved'});
      throw Error('legacy receipt requires reconciliation; no upload allowed');
    }
    const before=await inspect(io,expected);
    const attempt={...identity(m,approval,expected),attempt_id:randomUUID()};
    const marker=`PR3060 attempt=${attempt.attempt_id} manifest=${approval.manifestSha256}`;
    const metadata={main_module:PIN.module,compatibility_date:before.settings.compatibility_date,
      compatibility_flags:before.settings.compatibility_flags||[],usage_model:before.settings.usage_model,
      bindings:before.version.resources.bindings.map(b=>({name:b.name,type:'inherit'})),
      annotations:{'workers/message':marker,'workers/commit_sha':PIN.merge}};
    const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
    form.set(PIN.module,new Blob([js],{type:'application/javascript+module'}),PIN.module);
    form.set(PIN.module+'.map',new Blob([map],{type:'application/source-map'}),PIN.module+'.map');
    journal.append({...attempt,phase:'upload_intent',marker}); // fsync before POST; failure means no POST.
    let uploaded;
    try {
      uploaded=await io('POST',ROOT+'/versions?bindings_inherit=strict',form);
      assert.match(uploaded?.id||'',UUID,'upload acknowledgement lacks version ID');
    } catch {
      journal.append({...attempt,phase:'upload_unknown',marker});
      throw Error('upload outcome unknown; GET-only reconcile required; do not replay');
    }
    journal.append({...attempt,phase:'uploaded_unverified',marker,candidate:uploaded.id});
    const candidate=await io('GET',ROOT+'/versions/'+uploaded.id);
    assert.deepEqual(config(candidate),config(before.version),'candidate configuration/interface drift');
    assert.equal(candidate.annotations?.['workers/message'],marker,'candidate attempt identity mismatch');
    await inspect(io,expected,uploaded.id);
    // Metadata is not byte verification. There is deliberately no promotion here.
    return {candidate:uploaded.id,phase:'uploaded_unverified',promotion_enabled:false};
  } finally { journal.unlock(); }
}
export async function reconcile({io,journal=new Journal()}) {
  journal.acquire();
  try {
    const history=journal.read();assert.ok(history.length,'no durable attempt to reconcile');
    const last=history.at(-1),first=history[0];
    if(!last.marker||!last.baseline_config)return {phase:'unresolved',reason:'missing_attempt_evidence',writes:0};
    for(const e of history)assert.equal(e.attempt_id,first.attempt_id,'mixed attempts');
    const before=(await io('GET',ROOT+'/deployments')).deployments[0];
    if(before.id!==last.baseline_deployment||JSON.stringify(before.versions)!==JSON.stringify([{version_id:last.baseline_version,percentage:100}]))
      return {phase:'unresolved',reason:'deployment_drift',writes:0};
    const versions=(await io('GET',ROOT+'/versions')).items;
    const matches=versions.filter(v=>v.annotations?.['workers/message']===last.marker && v.annotations?.['workers/commit_sha']===last.source_merge);
    const after=(await io('GET',ROOT+'/deployments')).deployments[0];
    if(digest(before)!==digest(after))return {phase:'unresolved',reason:'deployment_drift',writes:0};
    if(matches.length!==1)return {phase:'unresolved',reason:matches.length?'ambiguous_candidates':'not_found_is_not_failure_proof',writes:0};
    const version=await io('GET',ROOT+'/versions/'+matches[0].id);
    assert.equal(version.annotations?.['workers/message'],last.marker,'candidate metadata mismatch');
    assert.equal(version.annotations?.['workers/commit_sha'],last.source_merge,'candidate source mismatch');
    if(last.candidate)assert.equal(last.candidate,version.id,'candidate changed');
    const baseline=await inspect(io,last.baseline_config,version.id);
    assert.deepEqual(config(version),config(baseline.version),'candidate configuration/interface drift');
    journal.append({...last,phase:'upload_observed_unverified',candidate:version.id});
    return {phase:'upload_observed_unverified',candidate:version.id,attempt_id:first.attempt_id,promotion_enabled:false,writes:0};
  } finally { journal.unlock(); }
}
export async function verifyUploaded({journal=new Journal()}) {
  journal.acquire();
  try {
    const last=journal.read().at(-1);assert.ok(last?.candidate,'uploaded candidate missing');
    journal.append({...last,phase:'verification_unavailable'});
    return {phase:'verification_unavailable',promotion_enabled:false,
      reason:'No supported inactive-version byte reader has been verified. Metadata/ETag alone cannot prove JS/map hashes.'};
  } finally {journal.unlock();}
}
// Retain byte/readback validation for a future proven reader and post-promotion
// acceptance. This function does not establish inactive-version attribution.
export async function validateReadback({readback,version,manifest,map}) {
  assert.equal(readback.etag,version.resources.script.etag,'readback version mismatch');
  const boundary=readback.text.slice(0,readback.text.indexOf('\r\n')).slice(2);
  const parts=await new Response(readback.text,{headers:{'content-type':'multipart/form-data; boundary='+boundary}}).formData();
  assert.deepEqual([...parts.keys()].sort(),[PIN.module,PIN.module+'.map'].sort(),'module set changed');
  assert.equal(hash(Buffer.from(await parts.get(PIN.module).arrayBuffer())),manifest.candidate_js_sha256,'JS readback mismatch');
  const returnedMap=JSON.parse(await parts.get(PIN.module+'.map').text()),expectedMap=JSON.parse(map);
  const normalize=value=>{const normalized={...value,sourceRoot:value.sourceRoot??value.sourcesRoot??null};delete normalized.sourcesRoot;return canonical(normalized);};
  assert.deepEqual(normalize(returnedMap),normalize(expectedMap),'map readback semantic mismatch');
  return {code_readback_exact:true,map_readback_semantic_equal:true};
}
export async function promote() { throw Error('promotion disabled: inactive-version JS/map verification is not implemented or proven'); }
// Reject the old combined operation, including callers holding old approval flags.
export async function release() { throw Error('combined release disabled; upload, verify-uploaded and promote are separate stages'); }
async function main() {
  const [mode,input,output]=process.argv.slice(2);
  if(mode==='prepare') {
    assert.ok(input&&output,'prepare BASELINE_DIR OUTPUT_DIR');
    const source=execFileSync('git',['show',PIN.merge+':'+PIN.source],{encoding:'utf8'});
    const result=await assemble(readFileSync(path.join(input,PIN.module),'utf8'),readFileSync(path.join(input,PIN.module+'.map'),'utf8'),source);
    const baseline=readJson(path.join(input,'baseline.json'));
    assert.equal(baseline.active_version,PIN.version);assert.equal(baseline.deployment.id,PIN.deployment);
    const expected={version:PIN.version,deployment:PIN.deployment,config_fingerprints:baseline.config_fingerprints,schedules:baseline.schedules,routes_sha256:baseline.routes_sha256};
    result.manifest.release_protocol='checkpts-upload-only.v2';
    result.manifest.promotion_enabled=false;
    result.manifest.verification_capability='inactive_version_bytes_unproven';
    result.manifest.baseline_configuration_sha256=hash(JSON.stringify(expected,null,2)+'\n');
    mkdirSync(output,{recursive:true});
    for(const [name,value] of [[PIN.module,result.code],[PIN.module+'.map',result.map],['baseline.json',JSON.stringify(expected,null,2)+'\n'],['manifest.json',JSON.stringify(result.manifest,null,2)+'\n']])writeFileSync(path.join(output,name),value);
    console.log(JSON.stringify(result.manifest,null,2));return;
  }
  if(mode==='promote')return promote();
  if(mode==='verify-uploaded') {console.log(JSON.stringify(await verifyUploaded({})));return;}
  if(mode==='reconcile') {console.log(JSON.stringify(await reconcile({io:transport(process.env.CLOUDFLARE_API_TOKEN)})));return;}
  assert.equal(mode,'upload-reviewed','mode must be prepare, upload-reviewed, reconcile, verify-uploaded or promote');
  assert.equal(process.env.CHECKPTS_UPLOAD_APPROVED,'true','no upload approval');
  const approval={approved:true,sourceMerge:process.env.CHECKPTS_APPROVED_SOURCE_MERGE,manifestSha256:process.env.CHECKPTS_APPROVED_MANIFEST_SHA256};
  console.log(JSON.stringify(await uploadReviewed({folder:input,approval,io:transport(process.env.CLOUDFLARE_API_TOKEN,{approved:true})})));

}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Checkpts operation stopped. Inspect the Worker journal and reconcile with GET; do not repeat writes.');process.exitCode=1;});
