import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { digest } from './admin-held-viewer-code-only.mjs';
import {
  BASELINE_REPLY_SHA256, BASELINE_POSTER_SHA256,
  reviewedSources, patchCareBackNovember, validateExpectedInputs, inspectBaseline,
} from './kenji-care-back-november-release.mjs';
import { ROOT } from './kenji-owner-price-chat-count-release.mjs';

const REVIEWED = reviewedSources();
const originalSender = readFileSync(new URL('../member-dashboard-chat-worker/test/fixtures/kenji-care-back-send-reply-live-20261031.txt', import.meta.url), 'utf8').trimEnd();
const renamedSender = originalSender.replace('async function sendReply(', 'async function sendReplyBeforeCareBackPoster(');
const oldPoster = JSON.parse(readFileSync(new URL('../member-dashboard-chat-worker/test/fixtures/kenji-care-back-poster-live-20261031.json', import.meta.url), 'utf8')).poster;
const WRAPPER = 'async function sendReply(...args) {\n' +
  '  const now = Date.now();\n' +
  '  const approved = careBackOctoberReply("care_back_overview", "", now);\n' +
  '  const promotion = careBackPosterMessages(args[2], args[4], approved, ' + JSON.stringify({url:oldPoster.url,preview_url:oldPoster.preview_url}) + ', now);\n' +
  '  if (promotion) { args[2] = promotion.text; args[4] = promotion.extra_messages; }\n' +
  '  return sendReplyBeforeCareBackPoster(...args);\n' +
  '}';
const PREFIX = 'const retainedPriceGate = "ready:d.size>=2";\n';
const SUFFIX = '\nconst retainedCheckptsAndOwnerPolicy = "unchanged";\n';
const MODULE = PREFIX + REVIEWED.baseline.careBackOctoberReply + '\n' +
  renamedSender + '\n' + REVIEWED.baseline.careBackPosterMessages + '\n' + WRAPPER + '\n' +
  ['boundedTruth','buildKenjiLiveTruthDecision','renderLineRightsCheck'].map(name=>REVIEWED.baseline[name]).join('\n') + SUFFIX;
const NOVEMBER = Date.parse('2026-11-01T00:00:00+07:00');
const DECEMBER = Date.parse('2026-12-01T00:00:00+07:00');
const callable = (source, name) => new Function(source + '\nreturn ' + name + ';')();
const evaluateProjection = (name, dependencies) => new Function(...Object.keys(dependencies),
  'return (' + REVIEWED.replacement[name] + ');')(...Object.values(dependencies));

test('recovered live-truth projection preserves canonical months only for an eligible verified quote', () => {
  const clean = value=>String(value||'');
  const bound = evaluateProjection('boundedTruth', { AUTHORITY3:'fixture-authority', text26:clean,
    hasVerifiedPoints:()=>false, safeLevel:clean, safeLifecycle:clean, safeEnvelope:clean });
  const input={ok:true,authority:'fixture-authority',identity_status:'resolved',membership:{level:'private_premium',lifecycle:'active'},
    renewal:{status:'ready',package_code:'premium',amount_thb:2500,membership_years:1,discount_verified:true,promotion:{bonus_months:6}}};
  assert.equal(bound(input).renewal.bonus_months,6);
  assert.equal(bound({...input,renewal:{...input.renewal,discount_verified:false}}).renewal.status,'review_required');
  assert.equal(bound({...input,identity_status:'unresolved'}),null);
  const decision = evaluateProjection('buildKenjiLiveTruthDecision', {AUTHORITY3:'fixture-authority',text26:clean,
    boundedTruth:bound,kenjiLiveTruthRequired:()=>true,membershipStatusText:()=> 'member status',
    MMD_MEMBERSHIP_STATUS_COPY_TH:{renewal_offer:({years})=> 'base '+years+' year',renewal_payment_pending:'payment review',renewal_pending:'review required'} });
  const result=decision('membership_renewal',input,{});
  assert.match(result.text,/CARE BACK เพิ่ม 6 เดือน/);assert.match(result.text,/base 1 year/);assert.equal(result.handoff_required,true);
  assert.doesNotMatch(decision('membership_renewal',{...input,renewal:{status:'review_required'}},{}).text,/CARE BACK/);
});

test('recovered rights response accepts the November shape and rejects stale October claims', () => {
  class FixtureDate extends Date {static now(){return NOVEMBER;}}
  const clean=value=>String(value||'');
  const render=evaluateProjection('renderLineRightsCheck',{Date:FixtureDate,AUTHORITY:'fixture-authority',
    LEVELS2:{private_premium:'Premium'},clean11:clean,date:v=>clean(v).slice(0,10),
    POINTS_AUTHORITY:'points-fixture',POINTS_AUTHORITY2:'points-fixture'});
  const input={ok:true,authority:'fixture-authority',identity_status:'resolved',membership:{level:'private_premium',lifecycle:'active',expire_at:'2027-01-01'},
    promotion:{authority:'owner_approved_november_returning_2026_v1',status:'conditional_eligible',package_code:'premium',total_years:1,base_years:1,promotion_years:0,promotion_days:0,promotion_months:6,requires_verified_payment:true,ends_before:'2026-12-01T00:00:00+07:00',checkout_status:'review_required',starts_from:'existing_expiry'},
    renewal:{status:'review_required',classification:'new_signup'}};
  const result=render(input);
  assert.match(result.text,/CARE BACK เพิ่ม 6 เดือน/);assert.match(result.text,/2026-11-30/);assert.doesNotMatch(result.text,/หมดอายุเกินหนึ่งปี/);
  assert.equal(result.handoff_required,true);
  const stale=render({...input,promotion:{...input.promotion,authority:'owner_approved_october_renewal_2026_v1',promotion_months:0,promotion_years:1,total_years:2}});
  assert.doesNotMatch(stale.text,/รวม 2 ปี|CARE BACK เพิ่ม 6 เดือน/);
});

test('expected currently released function bytes remain pinned separately from the November sources', () => {
  assert.equal(digest(REVIEWED.baseline.careBackOctoberReply), BASELINE_REPLY_SHA256);
  assert.equal(digest(REVIEWED.baseline.careBackPosterMessages), BASELINE_POSTER_SHA256);
  assert.notEqual(REVIEWED.functions.careBackOctoberReply.before_sha256, REVIEWED.functions.careBackOctoberReply.after_sha256);
  assert.notEqual(REVIEWED.functions.careBackPosterMessages.before_sha256, REVIEWED.functions.careBackPosterMessages.after_sha256);
  assert.match(REVIEWED.functionsDigest, /^[a-f0-9]{64}$/);
  assert.equal(callable(REVIEWED.baseline.careBackOctoberReply,'careBackOctoberReply')('care_back_overview','',NOVEMBER).text,
    'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ');
});

test('only five reviewed functions change and the complete sender, wrapper, pricing and Checkpts bytes remain identical', () => {
  const patched = patchCareBackNovember(MODULE, digest(MODULE));
  assert.ok(patched.code.startsWith(PREFIX));
  assert.ok(patched.code.endsWith(SUFFIX));
  assert.ok(patched.code.includes(renamedSender));
  assert.ok(patched.code.includes(WRAPPER));
  assert.equal(patched.preservation.unrelated_runtime_bytes_unchanged, true);
  assert.equal(patched.preservation.existing_carrier_body_unchanged, true);
  assert.equal(patched.preservation.existing_wrapper_unchanged, true);
  assert.equal(patched.preservation.model_pricing_and_checkpts_unchanged, true);
  assert.equal(patched.preservation.membership_and_payment_eligibility_unchanged, true);
  assert.deepEqual(patched.preservation.functions, ['careBackOctoberReply','careBackPosterMessages','boundedTruth','buildKenjiLiveTruthDecision','renderLineRightsCheck']);
  assert.doesNotThrow(() => new Function(patched.code));
});

test('unknown module digests, source drift, missing or duplicate target functions and repeated application stop', () => {
  assert.throws(() => patchCareBackNovember(MODULE, ''), /whole-module SHA-256/);
  assert.throws(() => patchCareBackNovember(MODULE + ' ', digest(MODULE)), /whole-module drift/);
  for (const name of Object.keys(REVIEWED.baseline)) {
    for (const code of [MODULE.replace(REVIEWED.baseline[name], ''), MODULE + REVIEWED.baseline[name],
      MODULE.replace(REVIEWED.baseline[name], REVIEWED.baseline[name].replace('{', '{ /* drift */'))]) {
      assert.throws(() => patchCareBackNovember(code, digest(code)), /exact reviewed baseline function/);
    }
  }
  const after = patchCareBackNovember(MODULE, digest(MODULE)).code;
  assert.throws(() => patchCareBackNovember(after, digest(after)), /exact reviewed baseline function/);
});

test('a missing or duplicate current wrapper or renamed sender stops instead of rebuilding a carrier', () => {
  for (const code of [
    MODULE.replace(WRAPPER, ''), MODULE + WRAPPER,
    MODULE.replace(renamedSender, ''), MODULE + renamedSender,
  ]) assert.throws(() => patchCareBackNovember(code, digest(code)), /existing (wrapper|sender)/);
});

test('historical and protected requests retain the same decisions while November copy changes only generic public answers', () => {
  const before = callable(REVIEWED.baseline.careBackOctoberReply,'careBackOctoberReply');
  const after = callable(REVIEWED.replacement.careBackOctoberReply,'careBackOctoberReply');
  for (const now of [Date.parse('2026-10-30T12:00:00+07:00'), NOVEMBER-1, DECEMBER]) {
    for (const intent of ['care_back_overview','care_back_current_member','model_lookup','checkpts']) {
      for (const text of ['', 'สลิป', 'โอนแล้ว', 'ของผม', 'ผมได้สิทธิ์ไหม', 'Black Card', 'VIP']) {
        assert.deepEqual(after(intent,text,now), before(intent,text,now));
      }
    }
  }
  for (const text of ['สลิป','โอนแล้ว','ของผม','ผมได้สิทธิ์ไหม','Black Card','VIP']) {
    assert.deepEqual(after('care_back_overview',text,NOVEMBER), before('care_back_overview',text,NOVEMBER));
  }
  assert.match(after('care_back_overview','',NOVEMBER).text, /30 พ.ย. 2569/);
});

test('actual recovered sender and unchanged wrapper serialize November copy plus URI CTA with no dated image', async () => {
  class FixtureDate extends Date { static now() { return NOVEMBER; } }
  const patched = patchCareBackNovember(MODULE,digest(MODULE)).code;
  let body;
  const sender = new Function('Date','fetch','text28','LINE_REPLY_URL3','EMS_ALBUMS_URL','GWS_ALBUMS_URL',
    patched + '\nreturn sendReply;')(
      FixtureDate, async (url,init) => {
        assert.equal(url,'https://api.line.me/v2/bot/message/reply');
        assert.equal(init.method,'POST');
        body=JSON.parse(init.body); return {ok:true,status:200};
      }, value=>{assert.equal(typeof value,'string');return value;},
      'https://api.line.me/v2/bot/message/reply','https://example.test/ems','https://example.test/gws');
  const reply=callable(REVIEWED.replacement.careBackOctoberReply,'careBackOctoberReply')('care_back_overview','',NOVEMBER);
  const cta=reply.label+' → '+reply.route;
  assert.deepEqual(await sender({LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token'},'synthetic-reply',reply.text+'\n'+cta),{ok:true,status:200});
  assert.deepEqual(body.messages.map(message=>message.type),['text','text']);
  assert.equal(body.messages[0].text,reply.text);
  assert.deepEqual(body.messages[1].quickReply.items[0].action,{type:'uri',label:reply.label,uri:reply.route});
  assert.doesNotMatch(JSON.stringify(body),/originalContentUrl|previewImageUrl|31 ธ.ค.|สิ้นปี/);
});

const VERSION = '11111111-1111-4111-8111-111111111111';
const DEPLOYMENT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
function inspectionIO(options={}) {
  const calls=[]; let approvals=0, deploymentReads=0, versionReads=0, uploadsReads=0;
  const deployment={id:DEPLOYMENT,strategy:'percentage',versions:[{version_id:VERSION,percentage:100}]};
  const version={id:VERSION,resources:{bindings:[],script:{handlers:['fetch']},script_runtime:{compatibility_date:'2026-10-01'}}};
  return {
    calls, get approvals(){return approvals;},
    sha:'a'.repeat(40), now:()=> '2026-11-01T09:00:00.000Z',
    approve:async()=>{approvals++;if(options.rejectApproval)throw new Error('approval denied');},
    readModule:async()=>({name:options.wrongModule?'unknown.js':'worker.js',code:MODULE}),
    call:async(path,init)=>{
      assert.equal(init,undefined,'inspection must only issue reads');calls.push(path);
      if(path===ROOT+'/deployments'){
        deploymentReads++;
        return {deployments:[options.deploymentDrift&&deploymentReads>1?{...deployment,id:OTHER}:deployment]};
      }
      if(path===ROOT+'/versions'){
        uploadsReads++;
        return {items:[{id:options.latestUploadDrift&&uploadsReads>1?OTHER:VERSION}]};
      }
      if(path===ROOT+'/versions/'+VERSION){
        versionReads++;
        return options.configDrift&&versionReads>1?{...version,resources:{...version.resources,bindings:[{name:'DRIFT',type:'plain_text',text:'true'}]}}:version;
      }
      throw new Error('unexpected inspection path '+path);
    },
  };
}

test('inspection reads and matches the actual current function pair without uploading or trusting historical version IDs', async () => {
  const io=inspectionIO();
  const report=await inspectBaseline(io);
  assert.equal(report.production_mutation,false);
  assert.equal(report.expected_version,VERSION);
  assert.equal(report.expected_deployment,DEPLOYMENT);
  assert.equal(report.expected_module_sha256,digest(MODULE));
  assert.equal(report.expected_functions_sha256,REVIEWED.functionsDigest);
  assert.equal(io.approvals,2);
  assert.ok(io.calls.every(path=>path.startsWith(ROOT+'/')));
});

test('inspection stops on denied approval, active or latest-version drift, configuration drift and unexpected module name', async () => {
  for(const [option,pattern] of [
    ['rejectApproval',/approval denied/],['deploymentDrift',/deployment changed/],
    ['latestUploadDrift',/latest upload changed/],['configDrift',/configuration changed/],
    ['wrongModule',/unexpected active module/],
  ])await assert.rejects(inspectBaseline(inspectionIO({[option]:true})),pattern);
});

test('release requires exact active identifiers and a combined baseline-plus-replacement digest', () => {
  const env={EXPECTED_VERSION:VERSION,EXPECTED_DEPLOYMENT:DEPLOYMENT,EXPECTED_MODULE:'worker.js',
    EXPECTED_MODULE_SHA256:digest(MODULE),EXPECTED_FUNCTIONS_SHA256:REVIEWED.functionsDigest};
  assert.equal(validateExpectedInputs(env).functionsDigest,REVIEWED.functionsDigest);
  for(const key of Object.keys(env))assert.throws(()=>validateExpectedInputs({...env,[key]:''}));
  assert.throws(()=>validateExpectedInputs({...env,EXPECTED_FUNCTIONS_SHA256:'f'.repeat(64)}),/reviewed baseline and replacement/);
});

test('workflow preserves manual inspect-default, exact-main approval and existing production serialization without new approvals', () => {
  const workflow=readFileSync(new URL('../.github/workflows/deploy-kenji-care-back-november.yml',import.meta.url),'utf8');
  assert.match(workflow,/default: inspect/);
  assert.match(workflow,/environment: mmd-production-mutation/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/inputs\.approved_sha == github\.sha/);
  assert.match(workflow,/uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow,/needs: \[production-approval, contracts\]/);
  assert.match(workflow,/deploy-member-dashboard-chat-worker-production/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/EXPECTED_FUNCTIONS_SHA256/);
  assert.doesNotMatch(workflow,/^\s*(push|schedule|workflow_run):/m);
  assert.doesNotMatch(workflow.split('  production-approval:')[0],/secrets\./);
  assert.doesNotMatch(workflow,/wrangler(?:@[^ ]+)? (?:deploy|versions upload)|mms-worker|route[_ -]sync|policy_readiness/);
});

