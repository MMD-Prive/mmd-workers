import test from "node:test";
import assert from "node:assert/strict";
import { parsePerRenameStartDate, membershipExpiryFromStart, projectOwnerMembershipContext, readKenjiOwnerMembershipContext } from "../src/kenji-owner-membership-context.js";
import { handleKenjiLineMemberTruth } from "../src/kenji-line-member-truth.js";
import { renderLineRightsCheck } from "../../member-dashboard-chat-worker/src/kenji-line-rights-check.mjs";
import { renderPrivateInterest } from "../../member-dashboard-chat-worker/src/kenji-private-interest.mjs";
import { buildKenjiLiveTruthDecision } from "../../member-dashboard-chat-worker/src/kenji-line-live-truth.mjs";
const uid = "U96f8216d8644acc6a7ae566cd5609842";
const now = Date.parse("2026-10-04T09:10:00Z");
for (const [name,date] of [["เล็ก14มค65","2022-01-14"],["เล็ก 14 มค 65","2022-01-14"],["เล็ก14ม.ค.2565","2022-01-14"],["เล็ก14มกราคม2022","2022-01-14"]]) test(`compact Thai date ${name}`,()=>assert.equal(parsePerRenameStartDate(name),date));
for (const name of ["เล็ก114มค65","เล็ก31กพ65","เล็ก14มค165","เล็ก14มค65x2","เล็ก14มค65 15กพ66","เล็ก14มค65ต่ออายุ15กพ66"]) test(`compact ambiguous date ${name}`,()=>assert.equal(parsePerRenameStartDate(name),null));
test("Lek owner offer is account/evidence scoped and grants no access",()=>{
 const f=fixture("เล็ก14มค65","U47880a424a18a501512b6fea35d3d44a");f.now=Date.parse("2026-10-30T13:00:00Z");
 const c=projectOwnerMembershipContext(f);assert.equal(c.expire_at,"2023-01-13T16:59:59.999Z");assert.equal(c.level,"private_premium");assert.equal(c.access_verified,false);assert.equal(c.renewal_offer.amount_thb,2500);assert.equal(c.renewal_offer.bonus_years,1);assert.equal(c.renewal_offer.grants_access,false);
 assert.equal(projectOwnerMembershipContext({...f,now:Date.parse("2026-11-01T01:00:00Z")}).renewal_offer,undefined);
 for(const name of ["Standard 14มค65","เล็ก14มค65x2","VIP14มค65"]){const changed=fixture(name,f.lineUserId);changed.now=f.now;assert.equal(projectOwnerMembershipContext(changed).renewal_offer,undefined);}
 const other=fixture("เล็ก14มค65",`U${"1".repeat(32)}`);other.now=f.now;assert.equal(projectOwnerMembershipContext(other).renewal_offer,undefined);
});
test("approved linked historical account answers renewal and the incident status sentence without access grants",t=>{
 t.mock.method(Date,"now",()=>Date.parse("2026-10-30T13:00:00Z"));
 const f=fixture("เล็ก14มค65","U47880a424a18a501512b6fea35d3d44a");f.now=Date.now();
 const owner=projectOwnerMembershipContext(f);
 const truth={ok:true,authority:"my_mmd_entitlement_resolver_v1",identity_status:"owner_oa_linked",owner_membership_context:owner};
 for(const intent of ["membership_status","membership_renewal"]){const d=buildKenjiLiveTruthDecision(intent,truth);assert.match(d.text,/Premium/);assert.match(d.text,/2,500/);assert.match(d.text,/โบนัสเพิ่ม 1/);assert.doesNotMatch(d.text,/intent=status|ได้รับสิทธิ์แล้ว/);assert.equal(d.handoff_required,true);}
 const mismatch=structuredClone(truth);mismatch.owner_membership_context.renewal_offer.source_record_id="different";
 assert.doesNotMatch(buildKenjiLiveTruthDecision("membership_renewal",mismatch).text,/2,500/);
 t.mock.method(Date,"now",()=>Date.parse("2026-11-02T13:00:00Z"));
 assert.doesNotMatch(buildKenjiLiveTruthDecision("membership_renewal",truth).text,/2,500/);
});
function fixture(name="เอก 25 สค 68", lineUserId=uid) {
  return { lineUserId, now, clients:[{id:"fixture-client",fields:{line_user_id:lineUserId}}], staging:[{id:"fixture-rename",fields:{"Import ID":`line_ofc_per_rename_v1_${lineUserId.toLowerCase()}`,"LINE User ID":lineUserId,"Current LINE Rename":name,"Source Hash":"a".repeat(64),"Imported At":"2026-07-26T12:48:04Z","Canonical Client":["fixture-client"]}}] };
}
for (const name of ["เอก 25 สค 68","เอก 25 ส.ค. 2568","เอก 25 สิงหาคม 2568","เอก 25 สิงหาคม 2025"]) test(`Thai date ${name}`,()=>assert.equal(parsePerRenameStartDate(name),"2025-08-25"));
for (const name of ["เอก 31 กพ 68","เอก 25 xx 68","เอก 25 สค 68 x2","เอก 25 สค","เอก 25 สค 168","เอก 25/8/68","เอก 25 สค 68 24 สค 69"]) test(`ambiguous/invalid suffix ${name}`,()=>assert.equal(parsePerRenameStartDate(name),null));
for (const [start,years,expected] of [["2025-08-25",1,"2026-08-24"],["2025-08-25",2,"2027-08-24"],["2024-02-29",1,"2025-02-27"],["2023-03-01",1,"2024-02-29"],["2024-12-31",2,"2026-12-30"]]) test(`calendar ${start}/${years}`,()=>assert.equal(membershipExpiryFromStart(start,years),expected));
test("known owner start and duration projects expired existing membership only",()=>{const c=projectOwnerMembershipContext(fixture());assert.equal(c.expire_at,"2026-08-24T16:59:59.999Z");assert.equal(c.lifecycle,"expired");assert.equal(c.level,"unknown");assert.equal(c.access_verified,false);assert.equal(c.canonical_sync,"pending");assert.equal(c.source_freshness,"import_timestamp_only");const truth={ok:true,owner_membership_context:c};const answer=renderLineRightsCheck(truth);assert.match(answer.text,/หมดอายุแล้ว/);assert.match(answer.text,/Member\/Entitlement/);assert.doesNotMatch(answer.text,/สถานะสมาชิกยังตรวจยืนยันไม่ครบ|แต้มที่ยืนยันและใช้ได้|ส่งเรื่องให้เปอร์ตรวจแล้ว/);const interest=renderPrivateInterest(truth);assert.equal(interest.audience,"existing_member");assert.doesNotMatch(interest.text,/Welcome|สมัครใหม่|1,199|2,999/);});
test("unknown actual duration does not guess one/two years from tier/x2",()=>{const f=fixture("Premium x2 25 สค 68",`U${"1".repeat(32)}`);const c=projectOwnerMembershipContext(f);assert.equal(c.expire_at,"");assert.equal(c.membership_known,true);});
test("changed start conflicts with specific owner fact instead of extending",()=>{const c=projectOwnerMembershipContext(fixture("เอก 25 สค 69"));assert.equal(c.expire_at,"");assert.match(c.conflict,/conflicts/);});
for (const tier of ["VIP","SVIP"]) test(`reliable ${tier} uses existing expiry reference only`,()=>{const c=projectOwnerMembershipContext(fixture(`${tier} 25 สค 68`,`U${"2".repeat(32)}`));assert.equal(c.level,tier.toLowerCase());assert.equal(c.expire_at,tier === "VIP" ? "2027-08-31T16:59:59.999Z" : "");assert.equal(c.non_expiring,tier === "SVIP");assert.equal(c.access_verified,false);});
test("VIP marketing substring is not protected tier evidence",()=>assert.equal(projectOwnerMembershipContext(fixture("superVIP 25 สค 68",`U${"2".repeat(32)}`)).expire_at,""));
test("specific account expiry takes priority over VIP reference",()=>{const c=projectOwnerMembershipContext(fixture("VIP 25 สค 68","Ua379e5257fed424d57ecde5add22c0fb"));assert.equal(c.expire_at,"2028-10-03T16:59:59.999Z");});
for (const alter of [f=>f.clients.push(f.clients[0]),f=>f.staging.push(f.staging[0]),f=>f.staging[0].fields["Canonical Client"]=["another-client"],f=>f.staging[0].fields["Import ID"]="generic_contact_import",f=>f.staging[0].fields["LINE User ID"]=`U${"f".repeat(32)}`,f=>f.staging[0].fields["Imported At"]="2027-01-01",f=>f.staging[0].fields["Imported At"]="invalid",f=>f.staging[0].fields["Source Hash"]=""]) test(`unqualified/ambiguous evidence ${alter}`,()=>{const f=fixture();alter(f);assert.equal(projectOwnerMembershipContext(f),null);});
test("scoped HTTP reads and missing canonical Member return owner context, without any write",async()=>{
 const f=fixture(), reads=[];
 const env={AIRTABLE_API_KEY:"fixture",AIRTABLE_BASE_ID:"fixture",AIRTABLE_HTTP:{fetch:async req=>{assert.equal(req.method,"GET");const url=new URL(req.url);reads.push(url);assert.match(url.searchParams.get("filterByFormula"),new RegExp(uid));const table=url.pathname.split("/").pop();return Response.json({records:table==="tblVv58TCbwh5j1fS"?f.clients:table==="tblOs8yyLK09SKrCt"?f.staging:[]});}}};
 assert.equal((await readKenjiOwnerMembershipContext(env,uid)).membership_known,true);
 for(const intent of ["rights_check","private_interest"]){const req=new Request("https://member-pages-worker.internal/__internal/kenji/member-truth",{method:"POST",headers:{"content-type":"application/json","x-mmd-internal-call":"true","x-mmd-service-binding":"member-dashboard-chat-worker"},body:JSON.stringify({line_user_id:uid,intent})});const res=await handleKenjiLineMemberTruth(req,env);assert.equal(res.status,200);const data=await res.json();assert.equal(data.identity_status,"owner_oa_linked");assert.equal(data.owner_membership_context.membership_known,true);assert.equal(data.membership,undefined);assert.equal(data.points,undefined);}
 assert.ok(reads.every(url=>url.searchParams.get("maxRecords")));
});
test("incomplete paginated evidence fails closed",async()=>{const env={AIRTABLE_API_KEY:"fixture",AIRTABLE_BASE_ID:"fixture",AIRTABLE_HTTP:{fetch:async()=>Response.json({records:[],offset:"more"})}};assert.equal(await readKenjiOwnerMembershipContext(env,uid),null);});
