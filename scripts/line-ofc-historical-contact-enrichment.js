#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const REAL_LINE = /^U[0-9a-f]{32}$/i;
const INTERNAL_EMAILS = new Set(["malemodel.bkk@gmail.com", "mmdprive@gmail.com", "tatcha.pram@gmail.com"]);
const GENERIC = new Set(["unknown","no","-","n/a","na","none","test","user","member","client"]);

const T = {
  clients: "tblVv58TCbwh5j1fS",
  members: "tblgWc5VRon5o8Mhk",
  current: "tblOs8yyLK09SKrCt",
  old: "tbl1u0foFBvgFpT9G",
  evidence: "tbl4wqlFG9Ovmtp4c",
};
const F = {
  clients: { name:"fldrHqkGQzvBLRxlP", email:"fldQ8TKFjyxs0Cjrk", phone:"fldNI0R5d9Y3ILPcO", username:"fldLYKquHMkgbOZ3U", mmd:"fld7bPB3pWS2wteUU", nick:"fldqPiCmuxLkXjy1P", uid:"fld5HfSGChKFbd4uh", display:"fldb7vkM1FWswNm3l", tg:"fldLPIcKLrZBQr9iU", email2:"fldbAlmCs8VpI9Clw", notes:"fldi31lnaFk9A9Xrp" },
  members: { email:"fldcoz7nK6O0XWWGH", phone:"fldsUXV3vMtXIbh7N", clients:"fldlhDy68MDQgUihs", email2:"fldgxTkuNR86HCuVB", phone2:"fldsHWMdrSZpqE4OQ" },
  current: { uid:"fldjanE2xn2N46F5R", email:"fldM3fQVrBJ3Skbpg", phone:"fldJuo7H1dW9klyM4", display:"fldB6Ni6TmR25ISDF", tg:"fldf7YqtNtHD48I76", rename:"fldOC1bxBGpBrf3U1", raw:"fld6ix2RCC78F9mMM", client:"fldtJMOL83srrdD1u" },
  old: { uid:"fld2QUTxsef1c4iaF", display:"fldLb8AdogDUhHcXE", rename:"fldjCNSYoa1dgnMux", client:"flddNUjdhqqTc73Pj", raw:"fldokS3CgUDQWu3Jw", phone:"fldUVq9Z8EtThpGY4", email:"fldMt5oodn6x6wJGf" },
  evidence: { id:"fld4GQNhp6SJEXHzH", label:"fldvTZtzOwuDBwYMb", users:"fldPdY6CKnTHszAFd", email:"fldm3yZbdMfBr6plM", emails:"fldlm2fAoLRpmnCoD", phone:"fldT6esMAeAgb2gLa", phones:"fldZqkYWzOqYYFZjp", nicks:"fldrTzGde9lONQITL", lineIds:"fldgNrGa2asykW1V6", telegrams:"fld6mgUl8i0L3yxyZ", client:"fldCgJySJI8ArvjGv", status:"fld6zIrxafGZE79qJ", score:"fldZ5i2Yut1yWGK6v", reason:"fldsAanki33CxCqNF" },
};

const clean=(v,n=50000)=>String(v??"").replace(/\0/g,"").trim().slice(0,n);
const links=v=>Array.isArray(v)?v.map(x=>clean(typeof x==="object"?x.id:x,80)).filter(Boolean):[];
const split=v=>clean(v).split(/[\n,;|]+/).map(x=>clean(x,254)).filter(Boolean);
function email(v){ const s=clean(v,254).toLowerCase().replace(/^mailto:/,""); if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(s))return ""; if(INTERNAL_EMAILS.has(s)||/^(?:no-?reply|noreply|notifications?|mailer-daemon)@/i.test(s))return ""; return s; }
function phone(v){ const s=clean(v,80), plus=s.startsWith("+"), d=s.replace(/\D/g,""); if(/^0[689]\d{8}$/.test(d))return "+66"+d.slice(1); if(/^66[689]\d{8}$/.test(d))return "+"+d; if(plus&&/^[689]\d{8}$/.test(d))return "+66"+d; return ""; }
function handle(v){ let s=clean(v,80).toLowerCase().replace(/^https?:\/\/(?:t\.me|telegram\.me)\//i,"").replace(/^@/,""); return /^[a-z0-9_.-]{4,40}$/.test(s)&&!GENERIC.has(s)?s:""; }
function normName(v){ return clean(v,160).normalize("NFKC").toLowerCase().replace(/[\u200b-\u200d\ufeff]/g,"").replace(/[“”'"`()\[\]{}<>]/g," ").replace(/[_/\\|]+/g," ").replace(/\s+/g," ").trim(); }
function goodName(v){ const s=normName(v); return !!s && s.length>=2 && s.length<=120 && !GENERIC.has(s) && !REAL_LINE.test(s) && !email(s) && !phone(s); }
function values(...xs){ return [...new Set(xs.flatMap(v=>Array.isArray(v)?v:split(v)).map(x=>clean(x)).filter(Boolean))]; }
function extractEmails(text){ const out=[]; for(const m of clean(text).matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi)){const e=email(m[0]);if(e)out.push(e)} return [...new Set(out)]; }
function extractPhones(text){ const out=[]; for(const m of clean(text).matchAll(/(?:phone|mobile|tel(?:ephone)?|เบอร์|โทร(?:ศัพท์)?)[\s:=-]{0,8}((?:\+?66|0)[\d\s().-]{8,16})/gi)){const p=phone(m[1]);if(p)out.push(p)} return [...new Set(out)]; }
function addIndex(map,key,id){ if(!key||!id)return; if(!map.has(key))map.set(key,new Set()); map.get(key).add(id); }
function unique(map,key){ const s=map.get(key); return s&&s.size===1?[...s][0]:""; }
function chunks(a,n=10){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out;}

class Airtable{
  constructor(){this.token=clean(process.env.AIRTABLE_API_KEY||process.env.MMS_AIRTABLE_API_TOKEN,2000);this.last=0;if(!this.token)throw Error("airtable_not_configured");}
  async req(table,opt={}){const u=new URL(`${API}/${BASE}/${table}`);u.searchParams.set("returnFieldsByFieldId","true");for(const[k,v]of Object.entries(opt.q||{})){if(Array.isArray(v))v.forEach(z=>u.searchParams.append(k,z));else if(v!==""&&v!=null)u.searchParams.set(k,String(v));}for(let n=0;;n++){const wait=this.last+230-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));this.last=Date.now();let res;try{res=await fetch(u,{method:opt.method||"GET",headers:{Authorization:`Bearer ${this.token}`,"Content-Type":"application/json"},body:opt.body?JSON.stringify(opt.body):undefined});}catch(e){if(n>=6)throw e;await new Promise(r=>setTimeout(r,500*2**n));continue}const d=await res.json().catch(()=>({}));if(res.ok)return d;if(![429,500,502,503,504].includes(res.status)||n>=6)throw Error(`airtable_${res.status}:${clean(d?.error?.message||d?.error?.type||"unknown",300)}`);await new Promise(r=>setTimeout(r,Math.max(Number(res.headers.get("retry-after")||0)*1000,700*2**n)));}}
  async list(table,fields){const out=[];let offset="";do{const d=await this.req(table,{q:{pageSize:100,...(offset?{offset}:{}),...(fields?.length?{"fields[]":fields}:{})}});out.push(...(d.records||[]));offset=clean(d.offset,500);}while(offset);return out;}
  async update(table,rows){for(const b of chunks(rows))await this.req(table,{method:"PATCH",body:{records:b.map(x=>({id:x.id,fields:x.fields})),typecast:false}});}
}

function buildProfiles(clients,current,old){
  const profiles=new Map(), byLine=new Map();
  for(const c of clients){const f=c.fields||{}, uid=clean(f[F.clients.uid],80);if(!REAL_LINE.test(uid))continue;const p={id:c.id,uid,names:new Set(),emails:new Set(),phones:new Set(),handles:new Set(),record:c};profiles.set(c.id,p);byLine.set(uid,c.id);for(const v of [f[F.clients.name],f[F.clients.mmd],f[F.clients.nick],f[F.clients.display]])if(goodName(v))p.names.add(normName(v));for(const v of [f[F.clients.email],f[F.clients.email2]]){const e=email(v);if(e)p.emails.add(e)}const ph=phone(f[F.clients.phone]);if(ph)p.phones.add(ph);for(const v of [f[F.clients.username],f[F.clients.tg]]){const h=handle(v);if(h)p.handles.add(h)}}
  function enrich(rows,S){for(const r of rows){const f=r.fields||{},targets=new Set(links(f[S.client])),uid=clean(f[S.uid],80);if(REAL_LINE.test(uid)&&byLine.has(uid))targets.add(byLine.get(uid));for(const id of targets){const p=profiles.get(id);if(!p)continue;for(const k of [S.display,S.rename])if(k&&goodName(f[k]))p.names.add(normName(f[k]));if(S.email){const e=email(f[S.email]);if(e)p.emails.add(e)}if(S.phone){const ph=phone(f[S.phone]);if(ph)p.phones.add(ph)}if(S.tg){const h=handle(f[S.tg]);if(h)p.handles.add(h)}for(const e of extractEmails(S.raw?f[S.raw]:""))p.emails.add(e);for(const ph of extractPhones(S.raw?f[S.raw]:""))p.phones.add(ph);}}
  }
  enrich(current,F.current);enrich(old,F.old);
  const idx={email:new Map(),phone:new Map(),handle:new Map(),name:new Map()};
  for(const p of profiles.values()){for(const v of p.emails)addIndex(idx.email,v,p.id);for(const v of p.phones)addIndex(idx.phone,v,p.id);for(const v of p.handles)addIndex(idx.handle,v,p.id);for(const v of p.names)addIndex(idx.name,v,p.id)}
  return {profiles,byLine,idx};
}

function evidenceSignals(r){const f=r.fields||{};return {
  linked:links(f[F.evidence.client]),
  emails:values(f[F.evidence.email],f[F.evidence.emails]).map(email).filter(Boolean),
  phones:values(f[F.evidence.phone],f[F.evidence.phones]).map(phone).filter(Boolean),
  handles:values(f[F.evidence.lineIds],f[F.evidence.telegrams]).map(handle).filter(Boolean),
  names:values(f[F.evidence.label],f[F.evidence.users],f[F.evidence.nicks]).filter(goodName).map(normName),
};}
function resolveEvidence(r,ctx){const s=evidenceSignals(r), valid=s.linked.filter(id=>ctx.profiles.has(id));if(valid.length===1)return {status:"matched",client:valid[0],score:1000,reason:"existing_canonical_link",signals:s};if(valid.length>1)return {status:"review_required",score:0,reason:"multiple_existing_canonical_links",signals:s};
  const vote=new Map();const voteFor=(id,w,why)=>{if(!id)return;const x=vote.get(id)||{score:0,reasons:[]};x.score+=w;x.reasons.push(why);vote.set(id,x)};
  for(const e of s.emails)voteFor(unique(ctx.idx.email,e),700,"exact_email");for(const p of s.phones)voteFor(unique(ctx.idx.phone,p),600,"exact_phone");for(const h of s.handles)voteFor(unique(ctx.idx.handle,h),550,"exact_handle");for(const n of s.names)voteFor(unique(ctx.idx.name,n),350,"exact_name");
  const ranked=[...vote.entries()].map(([client,x])=>({client,...x})).sort((a,b)=>b.score-a.score||a.client.localeCompare(b.client));if(!ranked.length)return {status:"review_required",score:0,reason:"no_exact_bridge",signals:s};const top=ranked[0],next=ranked[1];const strong=top.reasons.some(x=>x==="exact_email"||x==="exact_phone"||x==="exact_handle");if((strong&&top.score>=550&&(!next||top.score-next.score>=250))||(top.score>=700&&(!next||top.score-next.score>=300)))return {status:"matched",client:top.client,score:Math.min(999,top.score),reason:top.reasons.join("+"),signals:s};return {status:"review_required",score:top.score,reason:"ambiguous_exact_bridge",signals:s};}
function chooseEmail(signals){const a=[...new Set(signals.emails)];return a.length===1?a[0]:""}function choosePhone(signals){const a=[...new Set(signals.phones)];return a.length===1?a[0]:""}

async function run({apply=false,reportPath="",assertIdempotent=false}={}){
  const A=new Airtable(), vals=o=>Object.values(o);const [clients,members,current,old,evidence]=await Promise.all([A.list(T.clients,vals(F.clients)),A.list(T.members,vals(F.members)),A.list(T.current,vals(F.current)),A.list(T.old,vals(F.old)),A.list(T.evidence,vals(F.evidence))]);const ctx=buildProfiles(clients,current,old), clientById=new Map([...ctx.profiles].map(([id,p])=>[id,p.record])), membersByClient=new Map();for(const m of members)for(const id of links(m.fields?.[F.members.clients])){if(!membersByClient.has(id))membersByClient.set(id,[]);membersByClient.get(id).push(m)}
  const R={version:1,mode:apply?"apply":"dry_run",canonical_line_clients:ctx.profiles.size,historical_evidence_records:evidence.length,evidence_matched:0,evidence_review_required:0,matched_with_email:0,matched_with_phone:0,clients_email_already_present:0,clients_email_fill_planned:0,clients_phone_fill_planned:0,members_email_fill_planned:0,members_phone_fill_planned:0,evidence_updates_planned:0,conflicting_primary_emails:0};for(const p of ctx.profiles.values())if(email(p.record.fields?.[F.clients.email]))R.clients_email_already_present++;
  const clientUpdates=new Map(),memberUpdates=new Map(),evidenceUpdates=[];const proposedEmail=new Map();
  for(const ev of evidence){const z=resolveEvidence(ev,ctx), f=ev.fields||{}, ep={};if(z.status==="matched"){R.evidence_matched++;const e=chooseEmail(z.signals),ph=choosePhone(z.signals);if(e)R.matched_with_email++;if(ph)R.matched_with_phone++;ep[F.evidence.client]=[z.client];ep[F.evidence.status]="matched";ep[F.evidence.score]=z.score;ep[F.evidence.reason]=z.reason;const c=clientById.get(z.client),cf=c?.fields||{},cp=clientUpdates.get(z.client)||{};if(e&&!email(cf[F.clients.email])){const prev=proposedEmail.get(z.client);if(prev&&prev!==e){R.conflicting_primary_emails++;delete cp[F.clients.email];delete cp[F.clients.email2];}else{proposedEmail.set(z.client,e);cp[F.clients.email]=e;if(!email(cf[F.clients.email2]))cp[F.clients.email2]=e;}}if(ph&&!phone(cf[F.clients.phone]))cp[F.clients.phone]=ph;if(Object.keys(cp).length)clientUpdates.set(z.client,cp);for(const m of membersByClient.get(z.client)||[]){const mf=m.fields||{},mp=memberUpdates.get(m.id)||{};if(e&&!email(mf[F.members.email]))mp[F.members.email]=e;if(e&&!email(mf[F.members.email2]))mp[F.members.email2]=e;if(ph&&!phone(mf[F.members.phone]))mp[F.members.phone]=ph;if(ph&&!phone(mf[F.members.phone2]))mp[F.members.phone2]=ph;if(Object.keys(mp).length)memberUpdates.set(m.id,mp)}}else{R.evidence_review_required++;ep[F.evidence.status]="review_required";ep[F.evidence.score]=z.score||0;ep[F.evidence.reason]=z.reason}let changed=false;for(const[k,v]of Object.entries(ep)){const cur=f[k];if(Array.isArray(v)){if(JSON.stringify(links(cur).sort())!==JSON.stringify(v.slice().sort()))changed=true}else if(typeof v==="number"){if(Number(cur||0)!==v)changed=true}else{const cv=typeof cur==="object"&&cur?.name?cur.name:clean(cur,500);if(cv!==String(v))changed=true}}if(changed)evidenceUpdates.push({id:ev.id,fields:ep})}
  R.clients_email_fill_planned=[...clientUpdates].filter(([id,p])=>p[F.clients.email]).length;R.clients_phone_fill_planned=[...clientUpdates].filter(([id,p])=>p[F.clients.phone]).length;R.members_email_fill_planned=[...memberUpdates.values()].filter(x=>x[F.members.email]).length;R.members_phone_fill_planned=[...memberUpdates.values()].filter(x=>x[F.members.phone]).length;R.evidence_updates_planned=evidenceUpdates.length;R.pending_mutations=clientUpdates.size+memberUpdates.size+evidenceUpdates.length;
  if(R.conflicting_primary_emails>0)throw Error(`client_email_conflict_guardrail:${R.conflicting_primary_emails}`);if(R.evidence_matched+R.evidence_review_required!==evidence.length)throw Error("evidence_accounting_guardrail");if(apply){if(clientUpdates.size)await A.update(T.clients,[...clientUpdates].map(([id,fields])=>({id,fields})));if(memberUpdates.size)await A.update(T.members,[...memberUpdates].map(([id,fields])=>({id,fields})));if(evidenceUpdates.length)await A.update(T.evidence,evidenceUpdates)}R.completed_at=new Date().toISOString();if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(R,null,2)+"\n");process.stdout.write(JSON.stringify(R)+"\n");if(assertIdempotent&&R.pending_mutations)throw Error(`idempotency_failed:${R.pending_mutations}`);return R;}

function selfTest(){assert.equal(email("MmdPrive@gmail.com"),"");assert.equal(email("x@y.com"),"x@y.com");assert.equal(phone("098-550-1084"),"+66985501084");assert.equal(handle("@First"),"first");assert.equal(goodName("Unknown"),false);const ev={fields:{[F.evidence.email]:"a@b.com",[F.evidence.phone]:"0985501084",[F.evidence.label]:"เจ 24 เมย 69"}};const sig=evidenceSignals(ev);assert.deepEqual(sig.emails,["a@b.com"]);assert.deepEqual(sig.phones,["+66985501084"]);process.stdout.write("self-test passed\n");}
if(require.main===module){const a=process.argv.slice(2);if(a.includes("--self-test"))selfTest();else{const i=a.indexOf("--report");run({apply:a.includes("--apply"),reportPath:i>=0?a[i+1]:"",assertIdempotent:a.includes("--assert-idempotent")}).catch(e=>{process.stderr.write(clean(e?.stack||e,5000)+"\n");process.exitCode=1})}}
