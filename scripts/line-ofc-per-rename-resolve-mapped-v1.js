#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const API = "https://api.airtable.com/v0";
const BASE = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const SOURCE_CHUNK_ID = "line_oa_per_rename_20260906_apply_01";
const T = { source: "tblUXJvU47SzdVUwy", staging: "tblOs8yyLK09SKrCt", clients: "tblVv58TCbwh5j1fS" };
const F = {
  source: { id:"fldoeByeRJ9AC2jVa", payload:"fldiU8tW2SiJH6ErX", chunkSha:"fldcIyu3Lf4hj64ui", fullSha:"fldCwnBuIt2Chelyp", status:"fldotTefHDjZQGIVn" },
  staging: { uid:"fldjanE2xn2N46F5R", display:"fldB6Ni6TmR25ISDF" },
  clients: { uid:"fld5HfSGChKFbd4uh" },
};
const REAL_UID = /^U[0-9a-f]{32}$/i;
const BAD_RENAME = /(?:line[_\s-]?webhook|event\s*:|message\s*:|has_text|diagnostic|smoke|unknown|system|test(?:ing)?)/i;

function clean(v,n=2000000){return String(v??"").replace(/\0/g,"").trim().slice(0,n)}
function sha(v){return crypto.createHash("sha256").update(v).digest("hex")}
function validRename(v){const s=clean(v,500);return Boolean(s&&s.length<=500&&!BAD_RENAME.test(s))}
function captured(v){const s=clean(v,80);if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s))throw new Error("invalid_captured_at");return s.replace(" ","T")+"+09:00"}

class Air{
  constructor(){this.token=clean(process.env.AIRTABLE_API_KEY||process.env.AIRTABLE_TOKEN,3000);if(!this.token)throw new Error("airtable_not_configured")}
  async req(path){for(let a=0;a<5;a++){const j=path.includes("?")?"&":"?";const r=await fetch(`${API}/${BASE}/${path}${j}returnFieldsByFieldId=true`,{headers:{Authorization:`Bearer ${this.token}`}});if(r.ok)return r.json();if(![429,500,502,503,504].includes(r.status)||a===4)throw new Error(`airtable_${r.status}`);await new Promise(x=>setTimeout(x,350*(2**a)))}}
  async list(table,fields){let off="";const out=[];do{const q=new URLSearchParams({pageSize:"100"});for(const f of fields)q.append("fields[]",f);if(off)q.set("offset",off);const d=await this.req(`${table}?${q}`);out.push(...(d.records||[]));off=d.offset||""}while(off);return out}
}

async function loadBundle(air){
  const rows=await air.list(T.source,Object.values(F.source));
  const found=rows.filter(r=>clean(r.fields?.[F.source.id])===SOURCE_CHUNK_ID);
  assert.equal(found.length,1,`source_chunk_count_${found.length}`);
  const f=found[0].fields||{};assert.equal(clean(f[F.source.status]),"ready_apply");
  const b64=clean(f[F.source.payload]);assert.equal(sha(b64),clean(f[F.source.chunkSha]),"chunk_sha_mismatch");
  const raw=zlib.gunzipSync(Buffer.from(b64,"base64")).toString("utf8");assert.equal(sha(raw),clean(f[F.source.fullSha]),"full_sha_mismatch");
  const b=JSON.parse(raw);assert.equal(b.version,"line-ofc-per-rename-mapped-apply-bundle-v1");
  assert.deepEqual([b.counts.mapped_rooms,b.counts.ambiguous_rooms,b.counts.unmatched_rooms,b.counts.unique_mapped_identity_handles],[291,0,3188,291]);
  assert.equal((b.mapped||[]).length,291);return b;
}

async function main(){
  const outPath=process.argv[2]||"/tmp/per-rename-mapped-input.json";
  const reportPath=process.argv[3]||"";
  const air=new Air();const bundle=await loadBundle(air);
  const [staging,clients]=await Promise.all([air.list(T.staging,Object.values(F.staging)),air.list(T.clients,Object.values(F.clients))]);
  const stageById=new Map(staging.map(r=>[r.id,r]));const clientCounts=new Map();
  for(const c of clients){const u=clean(c.fields?.[F.clients.uid],80).toUpperCase();if(REAL_UID.test(u))clientCounts.set(u,(clientCounts.get(u)||0)+1)}
  const rows=[];const uidSet=new Set();let invalidRename=0, canonicalLinked=0, noClient=0, duplicateClient=0;
  let room99Passed=false;
  for(const m of bundle.mapped){
    const s=stageById.get(clean(m.handle,80));assert.ok(s,`missing_handle_${m.chat_ref}`);
    const uid=clean(s.fields?.[F.staging.uid],80);assert.ok(REAL_UID.test(uid),`invalid_uid_${m.chat_ref}`);
    const key=uid.toUpperCase();assert.ok(!uidSet.has(key),`duplicate_uid_${m.chat_ref}`);uidSet.add(key);
    const rename=clean(m.rename,500);if(!validRename(rename))invalidRename++;
    const cc=clientCounts.get(key)||0;if(cc===1)canonicalLinked++;else if(cc===0)noClient++;else duplicateClient++;
    rows.push({"LINE User ID":uid,"Current LINE Rename":rename,"Display Name":clean(s.fields?.[F.staging.display],160),"Captured At":captured(m.captured_at)});
    if(Number(m.chat_ref)===99){assert.equal(cc,1,"reference_room_99_client_not_unique");room99Passed=true}
  }
  assert.equal(uidSet.size,291);assert.equal(invalidRename,8);assert.equal(rows.length,291);assert.equal(room99Passed,true);
  const payload={rows};fs.writeFileSync(outPath,JSON.stringify(payload,null,2)+"\n");
  const fixed=Date.parse(bundle.backup_snapshot_cutoff);assert.ok(Number.isFinite(fixed));fs.utimesSync(outPath,new Date(fixed),new Date(fixed));
  const report={version:"line-ofc-per-rename-resolve-mapped-v1",fingerprint_match:{total_rooms:3479,mapped:291,ambiguous:0,unmatched:3188,mapped_unique_line_user_ids:291},apply_scope:{input_rows:291,eligible_authoritative_renames:291-invalidRename,held_invalid_rename:invalidRename},canonical_client_resolution:{unique_match:canonicalLinked,no_match:noClient,duplicate_uid:duplicateClient},reference_room_99_smoke:{passed:true,canonical_client_unique:true},output:{mtime:new Date(fixed).toISOString(),sha256:sha(fs.readFileSync(outPath))}};
  const text=JSON.stringify(report,null,2)+"\n";if(reportPath)fs.writeFileSync(reportPath,text);process.stdout.write(text);
}

if(process.argv.includes("--self-test")){
  assert.equal(validRename("ก้อง - SVIP -"),true);assert.equal(validRename("Unknown"),false);assert.equal(captured("2026-09-06 02:30:03"),"2026-09-06T02:30:03+09:00");process.stdout.write('{"ok":true,"self_test":"passed"}\n');
}else main().catch(e=>{console.error(JSON.stringify({ok:false,error:String(e?.message||e)}));process.exit(1)});
