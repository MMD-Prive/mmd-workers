#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const INTERNAL_EMAILS = new Set([
  "malemodel.bkk@gmail.com",
  "mmdprive@gmail.com",
  "tatcha.pram@gmail.com",
]);
const REAL_LINE = /^U[0-9a-f]{32}$/i;
const MARK = "[[LINE_OFC_EMAIL_RESOLUTION_V2]]";

const T = {
  clients: "tblVv58TCbwh5j1fS",
  members: "tblgWc5VRon5o8Mhk",
  console: "tblFHmfpB2TTrzO2e",
  oldStaging: "tbl1u0foFBvgFpT9G",
  currentStaging: "tblOs8yyLK09SKrCt",
  emailStage: "tblXAPkTK6KzUmFBD",
  accessEvidence: "tbl7ZfZzVu6nQOS1n",
  preSession: "tblwn6I9VWie5d7Ui",
  sessions: "tblC98mKWbzmPuNzX",
  payments: "tblWGGJJOx5eBvBZJ",
  entitlements: "tblNImdF9PKAxhXGi",
};

const F = {
  clients: { name:"fldrHqkGQzvBLRxlP", email:"fldQ8TKFjyxs0Cjrk", phone:"fldNI0R5d9Y3ILPcO", uid:"fld5HfSGChKFbd4uh", email2:"fldbAlmCs8VpI9Clw", notes:"fldi31lnaFk9A9Xrp" },
  members: { email:"fldcoz7nK6O0XWWGH", phone:"fldsUXV3vMtXIbh7N", clients:"fldlhDy68MDQgUihs", email2:"fldgxTkuNR86HCuVB", phone2:"fldsHWMdrSZpqE4OQ" },
  console: { email:"fldUraGV8yhE2yW9n", phone:"fldeYBg1ajvvbbiW8", uid:"fldizotASR8QgtSVK", payload:"fldn7MS0D9cdyQLtF", client:"fld9gMhvFWegM345O" },
  oldStaging: { uid:"fld2QUTxsef1c4iaF", client:"flddNUjdhqqTc73Pj", note:"fldokS3CgUDQWu3Jw", phone:"fldUVq9Z8EtThpGY4", email:"fldMt5oodn6x6wJGf" },
  currentStaging: { uid:"fldjanE2xn2N46F5R", email:"fldM3fQVrBJ3Skbpg", phone:"fldJuo7H1dW9klyM4", client:"fldtJMOL83srrdD1u" },
  emailStage: { email:"fldq7Xf8IdvfoJRcp", client:"fldhRHfsA9HtBiO1y", line:"fldt4CS4VoZJZLXPx" },
  accessEvidence: { client:"fldvf5oQMeetKPAM9", identityEmail:"flddqGQcrlTRZl8d5", senderEmail:"fldTaArdfL79QXWBB" },
  preSession: { email:"fld1Gj06zVMed1EME", line:"fldOvU690mT3dT9uS", client:"fldWeLiUcBUPye8me" },
  sessions: { email:"fldHrtgfjHDZ9NRmN", client:"fld6P6if0vDZCeV0C" },
  payments: { email:"fldC5GxsqpaX9X3P1", client:"fldcrLuJijj7xr0y8" },
  entitlements: { email:"fldi91X4V8Vu0PlfC", client:"fldPCcl6yQFG56cje", line:"fldZs9iX2KnEuUhc4" },
};

const clean = (v, n=50000) => String(v ?? "").replace(/\0/g, "").trim().slice(0,n);
const links = (v) => Array.isArray(v) ? v.map(x => clean(typeof x === "object" ? x.id : x, 80)).filter(Boolean) : [];
function normEmail(v) {
  const s = clean(v,254).toLowerCase().replace(/^mailto:/,"");
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(s)) return "";
  if (INTERNAL_EMAILS.has(s)) return "";
  if (/^(?:no-?reply|noreply|notifications?|drive-shares-noreply|mailer-daemon)@/i.test(s)) return "";
  if (/@(?:google\.com|googlemail\.com)$/i.test(s)) return "";
  return s;
}
function normPhone(v) {
  const raw = clean(v,80), plus = raw.startsWith("+"), d = raw.replace(/\D/g,"");
  if (/^0[689]\d{8}$/.test(d)) return "+66" + d.slice(1);
  if (/^66[689]\d{8}$/.test(d)) return "+" + d;
  if (plus && /^[689]\d{8}$/.test(d)) return "+66" + d;
  return "";
}
function extractEmails(text) {
  const out = new Set();
  for (const m of clean(text).matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi)) {
    const e = normEmail(m[0]); if (e) out.add(e);
  }
  return [...out];
}
function extractPhones(text) {
  const out = new Set(), s = clean(text);
  for (const m of s.matchAll(/(?:phone|mobile|tel(?:ephone)?|เบอร์|โทร(?:ศัพท์)?)[\s:=-]{0,8}((?:\+?66|0)[\d\s().-]{8,16})/gi)) {
    const p = normPhone(m[1]); if (p) out.add(p);
  }
  const t=s.trim(); if (/^(?:\+?66|0)[\d\s().-]{8,16}$/.test(t)) { const p=normPhone(t); if(p) out.add(p); }
  return [...out];
}
function addCandidate(box, value, source, score, at="") {
  const e = normEmail(value); if (!e) return;
  let c = box.get(e); if (!c) c = { value:e, score:0, sources:new Set(), observations:0, latest:"" };
  c.score = Math.max(c.score, score); c.sources.add(source); c.observations += 1;
  if (at && at > c.latest) c.latest = at;
  box.set(e,c);
}
function addPhone(box, value, source, score) {
  const p=normPhone(value); if(!p) return;
  let c=box.get(p); if(!c) c={value:p,score:0,sources:new Set(),observations:0};
  c.score=Math.max(c.score,score); c.sources.add(source); c.observations+=1; box.set(p,c);
}
function pickEmail(box) {
  const a=[...box.values()].sort((x,y)=>y.score-x.score || y.sources.size-x.sources.size || y.observations-x.observations || y.latest.localeCompare(x.latest) || x.value.localeCompare(y.value));
  if(!a.length) return { status:"unresolved" };
  if(a.length===1) return { status:"resolved", candidate:a[0] };
  const top=a[0], next=a[1];
  if(top.score>=970 && next.score<=900) return { status:"resolved", candidate:top };
  if(top.score>=930 && top.sources.size>=2 && top.score>=next.score+40) return { status:"resolved", candidate:top };
  if(top.score>=950 && next.score<=850) return { status:"resolved", candidate:top };
  return { status:"conflict", candidates:a.slice(0,5) };
}
function pickPhone(box) {
  const a=[...box.values()].sort((x,y)=>y.score-x.score || y.sources.size-x.sources.size || y.observations-x.observations || x.value.localeCompare(y.value));
  if(!a.length) return "";
  if(a.length===1 || a[0].score>=a[1].score+60 || (a[0].score>=950 && a[1].score<=850)) return a[0].value;
  return "";
}
function setMapSet(map,key,value){ if(!key||!value)return; if(!map.has(key))map.set(key,new Set()); map.get(key).add(value); }
function indexByClient(records, field){ const m=new Map(); for(const r of records) for(const id of links(r.fields?.[field])) setMapSet(m,id,r.id); return m; }
function appendAudit(old, resolution) {
  old=clean(old,90000); if(old.includes(MARK)) return old;
  const line = `${MARK} status=${resolution.status} source=${resolution.source||"none"} confidence=${resolution.score||0} at=${new Date().toISOString()}`;
  return old ? old + "\n" + line : line;
}
function chunks(a,n=10){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out;}

class Airtable {
  constructor(){ this.token=clean(process.env.AIRTABLE_API_KEY || process.env.MMS_AIRTABLE_API_TOKEN,2000); this.last=0; if(!this.token) throw Error("airtable_not_configured"); }
  async req(table,opt={}){
    const u=new URL(`${API}/${BASE}/${table}`); u.searchParams.set("returnFieldsByFieldId","true");
    for(const [k,v] of Object.entries(opt.q||{})){ if(Array.isArray(v)) v.forEach(z=>u.searchParams.append(k,z)); else if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,String(v)); }
    for(let n=0;;n++){
      const wait=this.last+230-Date.now(); if(wait>0) await new Promise(r=>setTimeout(r,wait)); this.last=Date.now();
      let res; try{ res=await fetch(u,{method:opt.method||"GET",headers:{Authorization:`Bearer ${this.token}`,"Content-Type":"application/json"},body:opt.body?JSON.stringify(opt.body):undefined}); }
      catch(e){ if(n>=6)throw e; await new Promise(r=>setTimeout(r,600*2**n)); continue; }
      const data=await res.json().catch(()=>({})); if(res.ok)return data;
      if(![429,500,502,503,504].includes(res.status)||n>=6)throw Error(`airtable_${res.status}:${clean(data?.error?.type||data?.error?.message||"unknown",160)}`);
      await new Promise(r=>setTimeout(r,Math.max(Number(res.headers.get("retry-after")||0)*1000,800*2**n)));
    }
  }
  async list(table, fields){ const out=[]; let offset=""; do{ const d=await this.req(table,{q:{pageSize:100,...(offset?{offset}:{}),...(fields?.length?{"fields[]":fields}:{})}}); out.push(...(d.records||[])); offset=clean(d.offset,500); }while(offset); return out; }
  async update(table, rows){ for(const b of chunks(rows,10)) await this.req(table,{method:"PATCH",body:{records:b.map(x=>({id:x.id,fields:x.fields})),typecast:false}}); }
}

function addLinkedCandidates(ctx, records, clientField, emailField, source, score, lineField="") {
  for(const r of records){ const f=r.fields||{}, at=clean(r.createdTime,80); const clientIds=links(f[clientField]); const line=lineField?clean(f[lineField],80):""; const targets=new Set(clientIds); if(REAL_LINE.test(line)&&ctx.clientByLine.has(line))targets.add(ctx.clientByLine.get(line).id); for(const id of targets){const box=ctx.boxByClient.get(id);if(box)addCandidate(box,f[emailField],source,score,at);} }
}

async function run({apply=false, reportPath=""}={}) {
  const A=new Airtable();
  const fields=o=>Object.values(o);
  const [clients,members,consoleRows,oldRows,currentRows,emailRows,accessRows,preRows,sessionRows,paymentRows,entRows]=await Promise.all([
    A.list(T.clients,fields(F.clients)), A.list(T.members,fields(F.members)), A.list(T.console,fields(F.console)), A.list(T.oldStaging,fields(F.oldStaging)), A.list(T.currentStaging,fields(F.currentStaging)), A.list(T.emailStage,fields(F.emailStage)), A.list(T.accessEvidence,fields(F.accessEvidence)), A.list(T.preSession,fields(F.preSession)), A.list(T.sessions,fields(F.sessions)), A.list(T.payments,fields(F.payments)), A.list(T.entitlements,fields(F.entitlements))
  ]);

  const clientById=new Map(), clientByLine=new Map(), boxByClient=new Map(), phoneByClient=new Map();
  for(const c of clients){const uid=clean(c.fields?.[F.clients.uid],80);if(!REAL_LINE.test(uid))continue;clientById.set(c.id,c);clientByLine.set(uid,c);boxByClient.set(c.id,new Map());phoneByClient.set(c.id,new Map());}
  if(clientByLine.size<300 || clientByLine.size>1500) throw Error(`client_line_guardrail:${clientByLine.size}`);
  const ctx={clientByLine,boxByClient};

  for(const c of clientById.values()){
    const b=boxByClient.get(c.id), p=phoneByClient.get(c.id), f=c.fields||{};
    addCandidate(b,f[F.clients.email],"client.contact_email",1200,c.createdTime); addCandidate(b,f[F.clients.email2],"client.email_compat",1190,c.createdTime); addPhone(p,f[F.clients.phone],"client.phone",1200);
  }
  for(const m of members){const f=m.fields||{};for(const id of links(f[F.members.clients])){if(!boxByClient.has(id))continue;addCandidate(boxByClient.get(id),f[F.members.email],"member.email",990,m.createdTime);addCandidate(boxByClient.get(id),f[F.members.email2],"member.email_compat",980,m.createdTime);addPhone(phoneByClient.get(id),f[F.members.phone],"member.phone",990);addPhone(phoneByClient.get(id),f[F.members.phone2],"member.phone_compat",980);}}
  for(const r of oldRows){const f=r.fields||{}, uid=clean(f[F.oldStaging.uid],80), targets=new Set(links(f[F.oldStaging.client]));if(REAL_LINE.test(uid)&&clientByLine.has(uid))targets.add(clientByLine.get(uid).id);for(const id of targets){if(!boxByClient.has(id))continue;addCandidate(boxByClient.get(id),f[F.oldStaging.email],"old_staging.email_candidate",985,r.createdTime);addPhone(phoneByClient.get(id),f[F.oldStaging.phone],"old_staging.phone_candidate",985);for(const e of extractEmails(f[F.oldStaging.note]))addCandidate(boxByClient.get(id),e,"old_staging.raw_note",900,r.createdTime);for(const p of extractPhones(f[F.oldStaging.note]))addPhone(phoneByClient.get(id),p,"old_staging.raw_note_phone",880);}}
  for(const r of currentRows){const f=r.fields||{},uid=clean(f[F.currentStaging.uid],80),targets=new Set(links(f[F.currentStaging.client]));if(REAL_LINE.test(uid)&&clientByLine.has(uid))targets.add(clientByLine.get(uid).id);for(const id of targets){if(!boxByClient.has(id))continue;addCandidate(boxByClient.get(id),f[F.currentStaging.email],"current_staging.email",985,r.createdTime);addPhone(phoneByClient.get(id),f[F.currentStaging.phone],"current_staging.phone",985);}}
  for(const r of consoleRows){const f=r.fields||{},uid=clean(f[F.console.uid],80),targets=new Set(links(f[F.console.client]));if(REAL_LINE.test(uid)&&clientByLine.has(uid))targets.add(clientByLine.get(uid).id);for(const id of targets){if(!boxByClient.has(id))continue;addCandidate(boxByClient.get(id),f[F.console.email],"console.member_email",985,r.createdTime);addPhone(phoneByClient.get(id),f[F.console.phone],"console.member_phone",985);for(const e of extractEmails(f[F.console.payload]))addCandidate(boxByClient.get(id),e,"console.payload_json",860,r.createdTime);for(const p of extractPhones(f[F.console.payload]))addPhone(phoneByClient.get(id),p,"console.payload_json_phone",850);}}
  addLinkedCandidates(ctx,emailRows,F.emailStage.client,F.emailStage.email,"email_identity_staging.matched_client",955,F.emailStage.line);
  addLinkedCandidates(ctx,accessRows,F.accessEvidence.client,F.accessEvidence.identityEmail,"client_access_evidence.identity_email",975);
  addLinkedCandidates(ctx,accessRows,F.accessEvidence.client,F.accessEvidence.senderEmail,"client_access_evidence.sender_email",900);
  addLinkedCandidates(ctx,preRows,F.preSession.client,F.preSession.email,"pre_session.identity_email",965,F.preSession.line);
  addLinkedCandidates(ctx,sessionRows,F.sessions.client,F.sessions.email,"session.email",950);
  addLinkedCandidates(ctx,paymentRows,F.payments.client,F.payments.email,"payment.member_email",950);
  addLinkedCandidates(ctx,entRows,F.entitlements.client,F.entitlements.email,"entitlement.member_email",975,F.entitlements.line);

  const resolutions=new Map(); const sourceCounts={}; let existing=0,resolved=0,conflicts=0,unresolved=0,phoneResolved=0;
  for(const [id,c] of clientById){const r=pickEmail(boxByClient.get(id));const current=normEmail(c.fields?.[F.clients.email])||normEmail(c.fields?.[F.clients.email2]);let final=r;if(current){final={status:"existing",candidate:{value:current,score:1200,sources:new Set(["client.existing"]),observations:1}};existing++;}else if(r.status==="resolved")resolved++;else if(r.status==="conflict")conflicts++;else unresolved++;const p=pickPhone(phoneByClient.get(id));if(p)phoneResolved++;resolutions.set(id,{...final,phone:p});if(final.candidate){for(const s of final.candidate.sources)sourceCounts[s]=(sourceCounts[s]||0)+1;}}

  const clientUpdates=[],memberUpdates=[],currentUpdates=[],preSessionUpdates=[];
  const membersByClient=indexByClient(members,F.members.clients);
  for(const [id,r] of resolutions){const c=clientById.get(id),f=c.fields||{},e=r.candidate?.value||"",p=r.phone||"";const patch={};if(e&&!normEmail(f[F.clients.email]))patch[F.clients.email]=e;if(e&&!normEmail(f[F.clients.email2]))patch[F.clients.email2]=e;if(p&&!normPhone(f[F.clients.phone]))patch[F.clients.phone]=p;if(e&&Object.keys(patch).length){const src=[...r.candidate.sources].sort()[0]||"evidence";patch[F.clients.notes]=appendAudit(f[F.clients.notes],{status:r.status,source:src,score:r.candidate.score});}if(Object.keys(patch).length)clientUpdates.push({id,fields:patch});for(const mid of membersByClient.get(id)||[]){const m=members.find(x=>x.id===mid),mf=m?.fields||{},mp={};if(e&&!normEmail(mf[F.members.email]))mp[F.members.email]=e;if(e&&!normEmail(mf[F.members.email2]))mp[F.members.email2]=e;if(p&&!normPhone(mf[F.members.phone]))mp[F.members.phone]=p;if(p&&!normPhone(mf[F.members.phone2]))mp[F.members.phone2]=p;if(Object.keys(mp).length)memberUpdates.push({id:mid,fields:mp});}}
  for(const r of currentRows){const f=r.fields||{},uid=clean(f[F.currentStaging.uid],80);let id=links(f[F.currentStaging.client])[0]||clientByLine.get(uid)?.id;if(!id||!resolutions.has(id))continue;const z=resolutions.get(id),e=z.candidate?.value||"",p=z.phone||"",patch={};if(e&&!normEmail(f[F.currentStaging.email]))patch[F.currentStaging.email]=e;if(p&&!normPhone(f[F.currentStaging.phone]))patch[F.currentStaging.phone]=p;if(Object.keys(patch).length)currentUpdates.push({id:r.id,fields:patch});}

  // Precompute the member email directly on the Per-Rename / Pre-Session
  // identity index. Runtime My MMD lookups can then resolve one indexed row
  // instead of scanning Clients, Members, Sessions, and evidence tables.
  // Only exact Client links (or exact LINE user IDs already mapped to one
  // Client) are eligible; a rename alone never creates an identity link.
  for(const r of preRows){const f=r.fields||{},uid=clean(f[F.preSession.line],80),linked=links(f[F.preSession.client]);const id=linked.length===1?linked[0]:(REAL_LINE.test(uid)&&clientByLine.get(uid)?.id)||"";if(!id||!resolutions.has(id))continue;const e=resolutions.get(id).candidate?.value||"";if(e&&!normEmail(f[F.preSession.email]))preSessionUpdates.push({id:r.id,fields:{[F.preSession.email]:e}});}

  const report={version:2,mode:apply?"apply":"dry_run",line_clients:clientByLine.size,existing_email:existing,resolved_missing_email:resolved,email_conflicts:conflicts,email_unresolved:unresolved,email_coverage_after_resolution:existing+resolved,phone_coverage_evidence:phoneResolved,planned_client_updates:clientUpdates.length,planned_member_updates:memberUpdates.length,planned_current_staging_updates:currentUpdates.length,planned_per_rename_email_updates:preSessionUpdates.length,source_counts:sourceCounts,source_records:{old_staging:oldRows.length,console:consoleRows.length,current_staging:currentRows.length,email_identity_staging:emailRows.length,access_evidence:accessRows.length,pre_session:preRows.length,sessions:sessionRows.length,payments:paymentRows.length,entitlements:entRows.length},completed_at:new Date().toISOString()};
  if(apply){await A.update(T.clients,clientUpdates);await A.update(T.members,memberUpdates);await A.update(T.currentStaging,currentUpdates);await A.update(T.preSession,preSessionUpdates);}
  if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
  process.stdout.write(JSON.stringify(report)+"\n"); return report;
}

function selfTest(){assert.equal(normEmail(" MMDPRIVE@gmail.com "),"");assert.equal(normEmail("client@example.com"),"client@example.com");assert.deepEqual(extractEmails("mail client@example.com and client@example.com"),["client@example.com"]);assert.equal(normPhone("098-550-1084"),"+66985501084");const b=new Map();addCandidate(b,"a@example.com","old_staging.email_candidate",985);addCandidate(b,"b@example.com","console.payload_json",860);assert.equal(pickEmail(b).candidate.value,"a@example.com");const c=new Map();addCandidate(c,"a@example.com","session.email",950);addCandidate(c,"b@example.com","payment.member_email",950);assert.equal(pickEmail(c).status,"conflict");process.stdout.write("self-test passed\n");}

if(require.main===module){const a=process.argv.slice(2);if(a.includes("--self-test"))selfTest();else{const i=a.indexOf("--report");run({apply:a.includes("--apply"),reportPath:i>=0?a[i+1]:""}).catch(e=>{process.stderr.write(clean(e?.stack||e,3000)+"\n");process.exitCode=1;});}}
