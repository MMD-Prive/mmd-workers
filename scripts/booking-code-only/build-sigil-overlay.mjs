// Offline only: patch the exact deployed artifact; never bundle the repository entrypoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const here=path.dirname(new URL(import.meta.url).pathname);
const args=process.argv.slice(2);const arg=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
if(!arg('--source-root'))throw Error('Provide --source-root pointing to the reviewed source checkout');
const repo=path.resolve(arg('--source-root'));
const output=path.resolve(arg('--output-dir')||here);await fs.mkdir(output,{recursive:true});
const esbuildArg=arg('--esbuild-module');const esbuild=await import(esbuildArg?pathToFileURL(path.resolve(esbuildArg)).href:'esbuild');
const sourcePin=JSON.parse(await fs.readFile(path.join(here,'sigil-source-pin.json'),'utf8'));
const expected='19b6d5329bb4a41e9728f3903becad25e73bfb480cd058fe999155d80a134b96';
const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim();
if(tree!==sourcePin.source_tree)throw Error('Unreviewed source tree');
if(esbuild.version!=='0.27.3')throw Error('Unexpected esbuild');
const hash=s=>createHash('sha256').update(s).digest('hex');
const original=await fs.readFile(path.resolve(arg('--baseline')||path.join(here,'sigil-baseline.js')),'utf8');
if(hash(original)!==expected)throw Error('Wrong deployed baseline');
const stub=(pairs)=>pairs.map(([local,live])=>`const bridge_${local} = ${live}; export {bridge_${local} as ${local}};`).join('\n');
const external=new Map([
 [path.join(repo,'sigil-booking-worker/src/index.js'),stub([['default','index_default'],['sanitizeModelForBooking','sanitizeModelForBooking'],['withBrowserCors','withBrowserCors']])],
 [path.join(repo,'auth-worker/src/member-entitlement-resolver.js'),stub([['resolveMemberEntitlements','resolveMemberEntitlements']])],
 [path.join(repo,'sigil-booking-worker/src/customer-search-policy.js'),stub(['allowedCustomerModelFolders','protectedCustomerModelAccess','safeSearchIntent'].map(n=>[n,n]))]
]);
const entry=`export {default as entitlementWorker} from '${repo}/sigil-booking-worker/src/entitlement-runtime-worker.js';\nexport {buildBookingTelegramText} from '${repo}/sigil-booking-worker/src/booking-telegram-formatter.js';`;
const bundle=await esbuild.build({absWorkingDir:repo,stdin:{contents:entry,resolveDir:repo,sourcefile:'sigil-reviewed-overlay-entry.js'},bundle:true,write:false,format:'iife',globalName:'__mmdBookingRelease20261103',platform:'browser',target:'es2022',minify:false,keepNames:true,metafile:true,plugins:[{name:'exact-live-dependencies',setup(build){build.onResolve({filter:/.*/},args=>{const full=path.resolve(args.resolveDir,args.path);if(external.has(full))return {path:path.relative(repo,full).split(path.sep).join('/'),namespace:'live'};});build.onLoad({filter:/.*/,namespace:'live'},args=>({contents:external.get(path.join(repo,args.path)),loader:'js'}));}}]});
// Explicit allowlist ensures no member-booking routes/coordinator or unrelated modules enter the overlay.
const allowed=['entitlement-runtime-worker.js','public-booking-owner.js','public-booking-membership.js','current-private-access.js','customer-discovery-policy.js','booking-telegram-formatter.js','sigil-reviewed-overlay-entry.js'];
for(const name of Object.keys(bundle.metafile.inputs))if(!name.startsWith('live:')&&!allowed.includes(path.basename(name)))throw Error('Unexpected bundled dependency '+name);
const sourceHashes={};
for(const [relative,pinned] of Object.entries(sourcePin.files)){
 const actual=await fs.readFile(path.join(repo,relative),'utf8');
 if(hash(actual)!==pinned)throw Error('Unreviewed source file '+relative);
 sourceHashes[relative]=hash(actual);
}
const overlay=bundle.outputFiles[0].text;
let candidate=original;const edits=[];
function replace(label,before,after){const at=candidate.indexOf(before);if(at<0||candidate.indexOf(before,at+before.length)>=0)throw Error('Expected exactly one anchor: '+label);candidate=candidate.slice(0,at)+after+candidate.slice(at+before.length);edits.push({label,at,before,after});}
replace('Public floor','var PUBLIC_MODEL_MIN_BUDGET_THB = 5e3;','var PUBLIC_MODEL_MIN_BUDGET_THB = 4500;');
replace('Add 4500 band while retaining legacy band','  if (["5000_10000", "5_10", "5k_10k"].includes(band))', '  if (["4500_10000", "4_5_10", "4_5k_10k"].includes(band)) return { provided: true, min_thb: 4500, max_thb: 1e4, label: "4500_10000" };\n  if (["5000_10000", "5_10", "5k_10k"].includes(band))');
// Carry only server-created booking context through the existing intake/resolve handlers.
replace('Index context argument','var index_default = {\n  async fetch(req, env, ctx) {','var index_default = {\n  async fetch(req, env, ctx, memberContext = null) {');
replace('Resolve context call','handleClientResolve(req, env)), cors)','handleClientResolve(req, env, memberContext)), cors)');
replace('Intake context call','handleBookingIntake(req, env, ctx)), cors)','handleBookingIntake(req, env, ctx, memberContext)), cors)');
replace('Resolve context parameter','async function handleClientResolve(req, env) {','async function handleClientResolve(req, env, memberContext = null) {');
replace('Trusted public access','const access = await resolveMemberAccess(env, { clientNickname, clientContact, lineOrMemberId });','const access = memberContext?.publicAccess || await resolveMemberAccess(env, { clientNickname, clientContact, lineOrMemberId });');
replace('Resolve signed owner','safeStringify({ kind: "client_resolve", access, saved_at:','safeStringify({ kind: "client_resolve", access, ...(memberContext?.publicBookingOwner ? {public_booking_owner:memberContext.publicBookingOwner} : {}), saved_at:');
replace('Intake context parameter','async function handleBookingIntake(req, env, ctx) {','async function handleBookingIntake(req, env, ctx, memberContext = null) {');
replace('Intake signed owner','const resolverPayload = {\n    ...incomingResolver,','const resolverPayload = {\n    ...incomingResolver,\n    public_booking_owner: memberContext?.publicBookingOwner || void 0,');
replace('Notify trusted identity','await notifyBookingDraft(env, { body, fields, rec, bookingRef, sessionId, nextUrl });','await notifyBookingDraft(env, { body, fields, rec, bookingRef, sessionId, nextUrl, trustedIdentity: memberContext?.bookingIdentity });');
replace('Notify identity parameter','async function notifyBookingDraft(env, { body, fields, rec, bookingRef, sessionId, nextUrl }) {','async function notifyBookingDraft(env, { body, fields, rec, bookingRef, sessionId, nextUrl, trustedIdentity }) {');
replace('Format trusted identity','const text2 = buildBookingTelegramText({ body, fields });','const text2 = buildBookingTelegramText({ body, fields, trustedIdentity });');
// Install closure after all required live variables exist. Old module bytes stay untouched.
const marker='// src/model-image-policy-worker.js';
replace('Install isolated reviewed entitlement/formatter',marker,`// BEGIN REVIEWED BOOKING OVERLAY 20261103\n${overlay}\nentitlement_runtime_worker_default = __mmdBookingRelease20261103.entitlementWorker;\nbuildBookingTelegramText = __mmdBookingRelease20261103.buildBookingTelegramText;\n// END REVIEWED BOOKING OVERLAY 20261103\n\n${marker}`);
replace('Remove stale source map pointer','//# sourceMappingURL=runtime-index.js.map','// Source map omitted: deterministic reviewed live overlay.');
let inverse=candidate;for(const edit of [...edits].reverse()){if(inverse.slice(edit.at,edit.at+edit.after.length)!==edit.after)throw Error('Inverse mismatch '+edit.label);inverse=inverse.slice(0,edit.at)+edit.before+inverse.slice(edit.at+edit.after.length);}
if(inverse!==original)throw Error('Unrelated live bytes changed');
if(candidate.includes('/__internal/member-booking'))throw Error('Unshipped member booking route introduced');
const runtimeStart=original.indexOf('// src/runtime-index.js');const runtimeBytes=original.slice(runtimeStart).replace('//# sourceMappingURL=runtime-index.js.map','// Source map omitted: deterministic reviewed live overlay.');if(!candidate.endsWith(runtimeBytes))throw Error('Live runtime routing changed');
const report={baseline_sha256:expected,candidate_sha256:hash(candidate),inverse_sha256:hash(inverse),baseline_bytes:Buffer.byteLength(original),candidate_bytes:Buffer.byteLength(candidate),reviewed_tree:tree,esbuild:esbuild.version,source_hashes:sourceHashes,inputs:bundle.metafile.inputs,edits:edits.map(e=>({label:e.label,at:e.at,before_sha256:hash(e.before),after_sha256:hash(e.after)})),unrelated_bytes_preserved:true,runtime_routes_preserved:true};
await fs.writeFile(path.join(output,'sigil-candidate.mjs'),candidate);await fs.writeFile(path.join(output,'sigil-overlay-proof.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(output,'sigil-overlay-edits.json'),JSON.stringify(edits,null,2));console.log(JSON.stringify(report,null,2));
