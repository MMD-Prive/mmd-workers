import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source + "\nexport { generatePartnerToken, sha256Hex, normalizePartnerSession, officiallyVerifiedPartnerSessions };", {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { default: worker, generatePartnerToken, sha256Hex, normalizePartnerSession, officiallyVerifiedPartnerSessions } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const PARTNER_ID = "recAAAAAAAAAAAAAA";
const SESSION_ID = "recBBBBBBBBBBBBBB";
const CLAIM_ID = "recCCCCCCCCCCCCCC";
const F = {
  partnerId:"fldXb55aiAjNPOUWc", active:"fldajmg66pf2ifGPu", approval:"fldwRzdtIoPbHKr7n", hash:"fldoaCF4k4YqyuQ7Q",
  telegramId:"fldi6XKGQAWUEdr3A", telegramVerified:"fldOPxUvKgAVW5a2M", sessionId:"fldLTq2kZbyRv22IA",
  paymentStatus:"fldTY5lE6m0kQf72n", snapshotId:"fld0jkscGAtyX7i2J", snapshot:"fldxyZ7S3tjF8chGR",
  confirmation:"fldrAQxUX4pRqz6qr", revision:"fldhO72ZSYcyjbLzi",
  paymentSession:"fld2wdhBvc8xrV6y5", verification:"fldJ7a0Ube9F0bmRy", stage:"fldydUWHhqVLMkNSC", amount:"fldvCSwrUW8OMAooS"
};

async function fixture(t) {
  const partner = { id:PARTNER_ID, fields:{[F.partnerId]:"partner_fixture",[F.active]:"Active",[F.approval]:"recognized",[F.telegramId]:"123456789",[F.telegramVerified]:"verified",fldXs6VyfXIHxBMpQ:[CLAIM_ID]} };
  const session = { id:SESSION_ID, fields:{[F.sessionId]:"sess_fixture",[F.paymentStatus]:"paid",[F.snapshotId]:"partner_fixture",[F.snapshot]:JSON.stringify({partner_record_id:PARTNER_ID}),[F.confirmation]:"pending",[F.revision]:1} };
  const claim = { id:CLAIM_ID, fields:{fld6PAywOhvDeelDJ:"verified_unlinked",fldGB7Raqm6O1NIhh:"published",fldaMlO1fRoazxfHg:[PARTNER_ID]} };
  const payment = {id:"recDDDDDDDDDDDDDD",fields:{[F.paymentSession]:"sess_fixture",[F.verification]:"verified",[F.stage]:"deposit",[F.amount]:2000}};
  const writes = [], notifications = [], bindRequests = [];
  const state = { partner, session, claim, payment, claims:[claim], payments:[payment], writes, notifications, bindRequests, identity:{aud:"2010864854",iss:"https://access.line.me",exp:Math.floor(Date.now()/1000)+300,sub:"U"+"a".repeat(32)} };
  const env = { ALLOWED_ORIGINS:"https://mmdbkk.com,https://www.mmdbkk.com", AIRTABLE_API_KEY:"fixture-only", AIRTABLE_BASE_ID:"appFixture", AIRTABLE_TABLE_MODEL_PARTNERS:"Partners", AIRTABLE_TABLE_SESSIONS:"Sessions", AIRTABLE_TABLE_PAYMENTS:"Payments", TOKEN_SECRET:"fixture-partner-token-secret", AUTH_SERVICE_PARTNERS_TO_TELEGRAM:"fixture-router-secret",
    TELEGRAM_WORKER:{async fetch(req){notifications.push(await req.json());return Response.json({ok:true,telegram:{ok:true}});}},
    TELEGRAM_BIND_AUTHORITY:{async fetch(req){bindRequests.push({url:req.url,body:await req.json()});return Response.json({ok:true,telegram_connected:false,connect_url:"https://t.me/mmdprivebot?start=bind_fixture",state:"connect_required"});}}
  };
  const token = await generatePartnerToken(env, PARTNER_ID);
  partner.fields[F.hash] = await sha256Hex(token);
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const req = input instanceof Request && !options ? input : new Request(input, options);
    const url = new URL(req.url);
    if (url.hostname === "api.line.me") return Response.json(state.identity);
    assert.equal(url.hostname,"api.airtable.com");
    const parts = url.pathname.split("/");
    const table = decodeURIComponent(parts[3]);
    const id = parts[4];
    if (req.method === "GET") {
      if (table === "tbluoZ5JiRcoUP6WT") return Response.json({records:state.claims});
      if (table === "Partners" && id === PARTNER_ID) return Response.json(partner);
      if (table === "Sessions" && id === SESSION_ID) return Response.json(session);
      if (table === "Payments") return Response.json({records:state.payments});
    }
    if (req.method === "PATCH") {
      const body = await req.json(); writes.push({table,id,fields:body.fields});
      const record = table === "Partners" ? partner : session;
      Object.assign(record.fields, body.fields);return Response.json(record);
    }
    throw new Error(`Unexpected fixture call ${req.method} ${table}`);
  };
  t.after(()=>{globalThis.fetch=original;});
  return {...state,state,env,token};
}

const post = (url,body,headers={}) => new Request(url,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
const lineRequest = (origin="https://mmdbkk.com") => post(origin+"/v1/partner/line/exchange",{id_token:"fixture-id-token"},{Origin:origin});
const callback = (body={},host="partners-worker.internal") => post("https://"+host+"/__internal/partner-job-confirm",{session_record_id:SESSION_ID,telegram_user_id:"123456789",action:"confirm",...body},{"x-mmd-service-binding":"telegram-worker"});

test("LINE exchange uses the approved existing identity and opens the native MMD dashboard", async t => {
  const f=await fixture(t);const response=await worker.fetch(lineRequest(),f.env,{});const body=await response.json();
  assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"no-store");
  const target=new URL(body.dashboard_url);assert.equal(target.origin,"https://www.mmdbkk.com");assert.equal(target.pathname,"/partner/dashboard");assert.ok(target.searchParams.get("t"));
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,"Partners");assert.equal(f.writes[0].id,PARTNER_ID);assert.deepEqual(Object.keys(f.writes[0].fields),[F.hash]);
  assert.equal(JSON.stringify(f.writes).includes(target.searchParams.get("t")),false);
});

for (const scenario of ["ambiguous","unapproved","inactive","wrong_link","expired_line","wrong_issuer"]) {
  test(`LINE exchange refuses ${scenario} without issuing Partner access`,async t=>{
    const f=await fixture(t);
    if(scenario==="ambiguous")f.state.claims=[f.claim,f.claim];
    if(scenario==="unapproved")f.claim.fields.fldGB7Raqm6O1NIhh="review";
    if(scenario==="inactive")f.partner.fields[F.active]="Suspended";
    if(scenario==="wrong_link")f.partner.fields.fldXs6VyfXIHxBMpQ=["recZZZZZZZZZZZZZZ"];
    if(scenario==="expired_line")f.state.identity.exp=1;
    if(scenario==="wrong_issuer")f.state.identity.iss="https://example.com";
    const response=await worker.fetch(lineRequest("https://www.mmdbkk.com"),f.env,{});
    assert.ok([401,403].includes(response.status));assert.equal(f.writes.length,0);
  });
}

test("legacy entry and HEAD requests stay private and route under the configured LIFF endpoint",async()=>{
  for(const method of ["GET","HEAD"]){
    const r=await worker.fetch(new Request("https://www.mmdbkk.com/v1/partner/line/login",{method}),{},{});
    assert.equal(r.status,302);assert.equal(r.headers.get("location"),"https://mmdbkk.com/sigil/model/dashboard/partner-login");assert.equal(r.headers.get("cache-control"),"no-store");
  }
});

test("LINE browser entry initializes once, uses no-referrer, and rejects foreign dashboard redirects",async()=>{
  const response=await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard/partner-login"),{},{});
  const html=await response.text();const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  for(const target of ["https://www.mmdbkk.com/partner/dashboard?t=fixture","https://example.com/partner/dashboard?t=fixture"]){
    const button={},state={};let initialized=0,replaced=null;
    const context={URL,document:{getElementById:id=>id==="go"?button:state},liff:{init:async()=>{initialized++;},isLoggedIn:()=>true,getIDToken:()=>"fixture-id-token"},fetch:async(path,options)=>{assert.equal(path,"/v1/partner/line/exchange");assert.equal(options.referrerPolicy,"no-referrer");return Response.json({ok:true,dashboard_url:target});},location:{replace:url=>{replaced=url;}}};
    vm.runInNewContext(script,context);await button.onclick();assert.equal(initialized,1);assert.equal(replaced,target.includes("example.com")?null:target);
  }
});

test("Telegram connect scopes the bind to the authenticated Partner, ignoring submitted identity",async t=>{
  const f=await fixture(t);
  const response=await worker.fetch(post("https://www.mmdbkk.com/v1/partner/telegram/connect?t="+encodeURIComponent(f.token),{partner_record_id:"recZZZZZZZZZZZZZZ"}),f.env,{});
  assert.equal(response.status,200);assert.deepEqual(f.bindRequests[0].body,{operation:"issue_partner",partner_record_id:PARTNER_ID});
});

test("an inactive Partner cannot use an existing token to issue a Telegram bind",async t=>{
  const f=await fixture(t);f.partner.fields[F.active]="Suspended";
  const response=await worker.fetch(post("https://www.mmdbkk.com/v1/partner/telegram/connect?t="+encodeURIComponent(f.token),{}),f.env,{});
  assert.equal(response.status,403);assert.equal(f.bindRequests.length,0);
});

for(const scenario of ["unpaid","slip_only","wrong_session","balance_only","zero_amount","wrong_telegram","wrong_partner"]){
  test(`Telegram confirmation blocks ${scenario} before writes or notifications`,async t=>{
    const f=await fixture(t);
    if(scenario==="unpaid")f.session.fields[F.paymentStatus]="pending";
    if(scenario==="slip_only")f.payment.fields[F.verification]="pending";
    if(scenario==="wrong_session")f.payment.fields[F.paymentSession]="sess_other";
    if(scenario==="balance_only")f.payment.fields[F.stage]="balance";
    if(scenario==="zero_amount")f.payment.fields[F.amount]=0;
    if(scenario==="wrong_partner")f.session.fields[F.snapshotId]="partner_other";
    const r=await worker.fetch(callback(scenario==="wrong_telegram"?{telegram_user_id:"987654321"}:{}),f.env,{});
    assert.ok([403,409].includes(r.status));assert.equal(f.writes.length,0);assert.equal(f.notifications.length,0);
  });
}

test("verified Telegram confirmation records one revision and replay sends no duplicate",async t=>{
  const f=await fixture(t);const first=await worker.fetch(callback(),f.env,{});assert.equal(first.status,200);
  assert.equal(f.session.fields[F.confirmation],"confirmed");assert.equal(f.session.fields[F.revision],2);assert.equal(f.notifications.length,1);
  const replay=await worker.fetch(callback(),f.env,{});assert.equal((await replay.json()).idempotent,true);assert.equal(f.writes.length,1);assert.equal(f.notifications.length,1);
  assert.equal((await worker.fetch(callback({action:"decline"}),f.env,{})).status,409);
  assert.equal((await worker.fetch(callback({},"www.mmdbkk.com"),f.env,{})).status,403);
});

test("Dashboard actions also recheck Payment Truth and do not accept a paid label alone",async t=>{
  const f=await fixture(t);f.payment.fields[F.verification]="pending";
  const r=await worker.fetch(post("https://www.mmdbkk.com/v1/partner/jobs/action?t="+encodeURIComponent(f.token),{session_record_id:SESSION_ID,action:"confirm"}),f.env,{});
  assert.equal(r.status,409);assert.equal((await r.json()).error.code,"official_verify_required");assert.equal(f.writes.length,0);
});

test("job projection fails closed and stops offering actions after a final response",async t=>{
  const f=await fixture(t);
  assert.equal(normalizePartnerSession(f.session).confirmation_allowed,false);
  const ids=await officiallyVerifiedPartnerSessions(f.env,[f.session]);assert.equal(ids.has("sess_fixture"),true);
  assert.equal(normalizePartnerSession(f.session,true).confirmation_allowed,true);
  f.session.fields[F.confirmation]="confirmed";assert.equal(normalizePartnerSession(f.session,true).confirmation_allowed,false);
});

test("the canonical deposit_paid status allows confirmation only with a verified deposit row",async t=>{
  const f=await fixture(t);f.session.fields[F.paymentStatus]="deposit_paid";
  assert.equal((await officiallyVerifiedPartnerSessions(f.env,[f.session])).has("sess_fixture"),true);
  assert.equal(normalizePartnerSession(f.session,true).confirmation_allowed,true);
  f.payment.fields[F.verification]="pending_review";
  assert.equal((await officiallyVerifiedPartnerSessions(f.env,[f.session])).size,0);
});

test("deployment preserves service credentials and never reads or writes Kendo records",async()=>{
  const workflow=await readFile(new URL("../../.github/workflows/deploy-partners-worker.yml",import.meta.url),"utf8");
  assert.doesNotMatch(workflow,/api\.airtable\.com|KENDO_TOKEN|secrets-file|secret put|openssl rand/);
  assert.match(workflow,/wrangler deploy --keep-vars --config/);
  assert.match(workflow,/secret list/);
  for(const host of ["mmdbkk.com","www.mmdbkk.com"])assert.ok(workflow.includes(host+"/sigil/model/dashboard/partner-login*"));
});
