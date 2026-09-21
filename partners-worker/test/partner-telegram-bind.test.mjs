import assert from "node:assert/strict";
import test from "node:test";
import { issuePartnerTelegramBind, consumeTelegramBind } from "../../admin-worker/src/telegram-identity-bind-authority.js";

async function bindFixture(t) {
  const partner={id:"recAAAAAAAAAAAAAA",fields:{"Approval Status":"recognized",Status:"Active",telegram_verification_status:"not_connected"}};
  const state={bind:null,writes:[]};
  const env={AIRTABLE_API_KEY:"fixture",AIRTABLE_BASE_ID:"appFixture",AIRTABLE_TABLE_MODEL_PARTNERS:"Partners",AIRTABLE_TABLE_TELEGRAM_IDENTITY_BINDS:"Binds"};
  const original=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const req=new Request(input,init);const url=new URL(req.url);const table=url.pathname.split('/')[3];
    if(req.method==="GET" && table==="Partners")return Response.json(partner);
    if(req.method==="GET" && table==="Binds")return Response.json({records:state.bind?[state.bind]:[]});
    const body=await req.json();
    if(req.method==="POST" && table==="Binds"){
      state.bind={id:"recBBBBBBBBBBBBBB",fields:body.records[0].fields};return Response.json({records:[state.bind]});
    }
    if(req.method==="PATCH"){
      state.writes.push({table,fields:body.records[0].fields});const record=table==="Partners"?partner:state.bind;
      Object.assign(record.fields,body.records[0].fields);return Response.json({records:[record]});
    }
    throw Error("Unexpected fixture request");
  };
  t.after(()=>{globalThis.fetch=original;});return {partner,state,env};
}

test("Partner Telegram nonce binds the exact partner once and rejects reuse by another account",async t=>{
  const {partner,state,env}=await bindFixture(t);
  const issued=await issuePartnerTelegramBind(env,{partner_record_id:partner.id});
  assert.equal(issued.ok,true);const token=new URL(issued.connect_url).searchParams.get("start");
  assert.deepEqual(state.bind.fields.Partner,[partner.id]);assert.equal(state.bind.fields.role,"partner");
  assert.match(state.bind.fields.token_hash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(state.bind).includes(token),false);
  const consumed=await consumeTelegramBind(env,{start_arg:token,telegram_user_id:"123456789",telegram_username:"fixture_partner"});
  assert.equal(consumed.telegram_connected,true);assert.equal(partner.fields["Telegram ID"],"123456789");
  assert.equal(partner.fields.telegram_verification_status,"verified");const count=state.writes.length;
  assert.equal((await consumeTelegramBind(env,{start_arg:token,telegram_user_id:"123456789"})).state,"already_connected");
  assert.equal((await consumeTelegramBind(env,{start_arg:token,telegram_user_id:"987654321"})).error,"telegram_bind_already_consumed");
  assert.equal(state.writes.length,count);
});

test("expired Partner Telegram nonce cannot write a Telegram identity",async t=>{
  const {partner,state,env}=await bindFixture(t);const issued=await issuePartnerTelegramBind(env,{partner_record_id:partner.id});
  state.bind.fields.expires_at="2020-01-01T00:00:00Z";
  const result=await consumeTelegramBind(env,{start_arg:new URL(issued.connect_url).searchParams.get("start"),telegram_user_id:"123456789"});
  assert.equal(result.error,"telegram_bind_expired");assert.equal(partner.fields["Telegram ID"],undefined);assert.equal(state.writes.some(x=>x.table==="Partners"),false);
});
