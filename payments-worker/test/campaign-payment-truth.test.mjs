import test from "node:test";
import assert from "node:assert/strict";
import { AirtablePaymentTruthStore } from "../campaign-payment-truth.js";

const env={AIRTABLE_BASE_ID:"app-test",AIRTABLE_API_KEY:"test-only",AIRTABLE_TABLE_PAYMENTS:"payments",
  AIRTABLE_TABLE_MEMBER_PACKAGES:"member_packages",AIRTABLE_TABLE_MEMBERS:"members"};
const F={ref:"fldOO6SY49iDw8VBZ",status:"fldEJ1hmm7KwWuI6q",verification:"fldJ7a0Ube9F0bmRy",pkg:"fldfyHYVrzbGPvMJR",
  stage:"fldrr9g8ZZjqAbdKQ",claim:"fld0qxp5w6QwMiaue",email:"fldC5GxsqpaX9X3P1",start:"flddb8reg1p3mieWn",end:"fldEB5ShHgAjj24c7",
  memberEmail:"fld25NnjluFneSgZc",memberStatus:"fldeJDrGbpKXdORQY"};

function mockAirtable(records){return async(url)=>{const decoded=decodeURIComponent(String(url));let rows=[];
  if(decoded.includes("/payments?")){const ref=decoded.includes("renewal-ref")?"renewal-ref":decoded.includes("upgrade-ref")?"upgrade-ref":"unpaid-ref";rows=records.payments[ref]?[records.payments[ref]]:[];}
  if(decoded.includes("/member_packages?"))rows=records.packages||[];
  return new Response(JSON.stringify({records:rows}),{status:200,headers:{"content-type":"application/json"}});};}

test("admin/browser payment booleans cannot turn an unpaid record into truth",async()=>{
  const original=globalThis.fetch;globalThis.fetch=mockAirtable({payments:{"unpaid-ref":{id:"recPayment000001",fields:{[F.ref]:"unpaid-ref",[F.status]:"Pending",[F.verification]:"pending_review",[F.stage]:"membership",[F.claim]:"claim-1"}}}});
  try{const store=new AirtablePaymentTruthStore(env);await assert.rejects(()=>store.verify({claimId:"claim-1",paymentRequired:true,paymentReference:"unpaid-ref",paymentVerified:true}),/verified_payment_required/);}
  finally{globalThis.fetch=original;}
});

test("authoritative renewal and Premium upgrade records must both be Paid and verified",async()=>{
  const payment=(ref,pkg)=>({id:`rec${ref}`,fields:{[F.ref]:ref,[F.status]:"Paid",[F.verification]:"verified",[F.stage]:"membership",[F.pkg]:pkg,[F.claim]:"claim-1",[F.email]:"member@example.com"}});
  const packageRecord={id:"recPackage000001",fields:{[F.start]:"2026-08-01",[F.end]:"2027-08-01",[F.memberEmail]:"member@example.com",[F.memberStatus]:"active"}};
  const original=globalThis.fetch;globalThis.fetch=mockAirtable({payments:{"renewal-ref":payment("renewal-ref","standard"),"upgrade-ref":payment("upgrade-ref","premium")},packages:[packageRecord]});
  try{const store=new AirtablePaymentTruthStore(env);const truth=await store.verify({claimId:"claim-1",paymentRequired:true,paymentReference:"renewal-ref",upgradeRequired:true,upgradePaymentReference:"upgrade-ref"});
    assert.equal(truth.paymentVerified,true);assert.equal(truth.upgradePaymentVerified,true);assert.equal(truth.targetMemberPackageId,"recPackage000001");
    await assert.rejects(()=>store.verify({claimId:"claim-1",paymentRequired:true,paymentReference:"renewal-ref",upgradeRequired:true,upgradePaymentReference:"renewal-ref"}),/distinct_renewal/);}
  finally{globalThis.fetch=original;}
});
